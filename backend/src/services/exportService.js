'use strict';
/**
 * Exportación del resultado de un reporte a PDF, Excel, CSV, HTML, JSON y XML.
 *
 * Todos los formatos parten de la MISMA estructura {columnas, filas} que produce
 * el ejecutor, y aplican los formatos y alias configurados en cada columna: lo
 * exportado se ve como lo que el usuario tenía en pantalla.
 *
 * pdfmake DEBE PERMANECER EN 0.2.x. La versión 0.3 eliminó la interfaz de
 * servidor que se usa aquí (`new PdfPrinter(fonts)`), y el fallo aparece en
 * tiempo de ejecución —«PdfPrinter is not a constructor»—, no al instalar.
 *
 * En HTML el logo del branding se incrusta en base64 dentro del propio archivo,
 * en vez de enlazarlo: el documento debe verse igual al abrirlo desde un correo,
 * sin conexión y sin acceso al servidor.
 *
 * Estas funciones devuelven un buffer y no escriben en disco. Quien exporta lo
 * envía como descarga (rutas) o como adjunto (worker), sin dejar archivos
 * temporales que después habría que limpiar.
 */
const path = require('path');
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');

// Mismo directorio que backend/.puppeteerrc.cjs, sin depender del cwd: como
// servicio (LocalSystem) el Chromium del perfil de quien instaló no existe.
process.env.PUPPETEER_CACHE_DIR ||= path.resolve(__dirname, '../../.cache/puppeteer');

/**
 * Fuentes estándar del formato PDF: no hay que empaquetar ningún .ttf y
 * cubren los acentos del español mediante WinAnsiEncoding.
 */
const FUENTES = {
  Helvetica: {
    normal: 'Helvetica', bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique'
  }
};
const TAMANOS = ['A4', 'A3', 'LETTER', 'LEGAL', 'TABLOID'];
const MAX_PDF_FILAS = 500;

/**
 * Exporta un dataset (array de objetos) a CSV / Excel / JSON / XML / HTML.
 * El HTML incrusta el branding (logo + encabezado) de la empresa.
 *
 * columnas = [{ NombreCampo, AliasVisible, VisiblePorDefecto, Formato, ... }]
 *   Si no se pasan, se infieren de las llaves de la primera fila.
 */
const MIME = {
  CSV:  'text/csv; charset=utf-8',
  EXCEL:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  JSON: 'application/json; charset=utf-8',
  XML:  'application/xml; charset=utf-8',
  HTML: 'text/html; charset=utf-8',
  PDF:  'application/pdf'
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/** El encabezado de empresa se guarda como HTML; en PDF se vuelca como texto. */
const quitarHtml = (s) => String(s ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|h[1-6])>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();

/**
 * Extrae hasta `max` líneas de texto no vacías de un fragmento HTML.
 * Los tags de bloque (apertura y cierre) se tratan como saltos de línea.
 * lineas[0] = nombre empresa, lineas[1..] = dirección / RUC / teléfono, etc.
 */
const lineasHtml = (s, max = 4) => {
  if (!s) return [];
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr|td)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, max);
};

function resolverColumnas(rows, columnas) {
  const visibles = (columnas || []).filter(c => c.VisiblePorDefecto !== false);
  if (visibles.length) return visibles.map(c => ({
    campo: c.NombreCampo, titulo: c.AliasVisible || c.NombreCampo,
    formato: c.Formato || 'TEXTO', patron: c.FormatoPatron || null
  }));
  const first = rows[0] || {};
  return Object.keys(first).map(k => ({ campo: k, titulo: k, formato: 'TEXTO', patron: null }));
}

function aplicarPatronFecha(d, patron) {
  const pad = n => String(n).padStart(2, '0');
  return patron
    .replace('yyyy', d.getFullYear())
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('dd',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()));
}

function formatearCelda(valor, col) {
  if (valor === null || valor === undefined) return '';
  if (col.formato === 'FECHA') {
    const d = valor instanceof Date ? valor : new Date(valor);
    if (!isNaN(d.getTime())) return aplicarPatronFecha(d, col.patron || 'dd/MM/yyyy HH:mm');
  }
  const s = valor instanceof Date ? valor.toISOString() : String(valor);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return aplicarPatronFecha(d, col.patron || 'dd/MM/yyyy HH:mm');
  }
  return s;
}

class ExportService {
  contentType(formato) { return MIME[formato] || 'application/octet-stream'; }
  extension(formato) {
    return ({ CSV:'csv', EXCEL:'xlsx', JSON:'json', XML:'xml', HTML:'html', PDF:'pdf' }[formato] || 'bin');
  }

  /**
   * @param {object} opciones { titulo, branding, orientacion, tamanoHoja, subtitulo }
   * @returns {Promise<Buffer>}
   */
  async exportar(formato, rows, columnas, opciones = {}) {
    const { titulo = 'Reporte', branding = null, subtitulo = null } = opciones;
    switch ((formato || '').toUpperCase()) {
      case 'CSV':   return this._csv(rows, columnas, titulo, subtitulo, branding);
      case 'EXCEL': return this._excel(rows, columnas, titulo, subtitulo, branding);
      case 'JSON':  return Buffer.from(JSON.stringify(rows, null, 2), 'utf8');
      case 'XML':   return this._xml(rows, columnas);
      case 'HTML':  return this._html(rows, columnas, titulo, branding);
      case 'PDF': {
        const htmlStr = this._html(rows, columnas, titulo, branding).toString('utf8');
        return this._pdf_desde_html(htmlStr, opciones.orientacion, opciones.tamanoHoja);
      }
      default: throw Object.assign(new Error('Formato no soportado'), { status: 400 });
    }
  }

  /**
   * Convierte un string HTML completo a PDF usando Chromium (puppeteer).
   * El HTML proviene de _html(), así que el PDF se ve exactamente igual
   * que la exportación HTML.
   */
  async _pdf_desde_html(htmlContent, orientacion = 'VERTICAL', pSize = 'A4') {
    const puppeteer = require('puppeteer');
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (e) {
      if (/Could not find Chrome/i.test(e.message)) {
        throw new Error(`No se encontró Chromium para generar el PDF (se busca en ${process.env.PUPPETEER_CACHE_DIR}). ` +
          'En el servidor, dentro de la carpeta backend, ejecute: npx puppeteer browsers install chrome');
      }
      throw e;
    }
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      const formato = pSize === 'A3' ? 'A3'
        : pSize === 'LETTER' ? 'Letter'
        : pSize === 'LEGAL'  ? 'Legal'
        : pSize === 'TABLOID' ? 'Tabloid'
        : 'A4';
      const pdf = await page.pdf({
        format: formato,
        landscape: String(orientacion).toUpperCase() === 'HORIZONTAL',
        printBackground: true,
        margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' }
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // ponytail: pdfmake legacy, remover cuando html-pdf esté estable
  /*
  async _pdf(rows, columnas, { titulo = 'Reporte', branding = null,
    orientacion = 'VERTICAL', tamanoHoja = 'A4', subtitulo = null } = {}) {
    const totalFilas = rows.length;
    if (rows.length > MAX_PDF_FILAS) rows = rows.slice(0, MAX_PDF_FILAS);
    const cols = resolverColumnas(rows, columnas);
    const defs = (columnas || []).filter(c => c.VisiblePorDefecto !== false);
    const esNum = (campo) => {
      const d = defs.find(x => x.NombreCampo === campo);
      return ['ENTERO', 'NUMERO', 'MONEDA', 'PORCENTAJE'].includes(d?.Formato);
    };

    const numCols = cols.length;
    const orientFinal = String(orientacion).toUpperCase() === 'HORIZONTAL' ? 'landscape' : 'portrait';
    // Font adaptativa para tablas muy anchas.
    const fontSize = numCols > 15 ? 6 : numCols > 10 ? 7 : 8;

    // Anchos proporcionales: muestrear hasta 200 filas para estimar el max de chars por columna.
    const PAGE_W = { A4: 595, A3: 842, LETTER: 612, LEGAL: 612, TABLOID: 792 };
    const PAGE_H = { A4: 842, A3: 1190, LETTER: 792, LEGAL: 1008, TABLOID: 1224 };
    const pSize = TAMANOS.includes(String(tamanoHoja).toUpperCase()) ? String(tamanoHoja).toUpperCase() : 'A4';
    const pageW = orientFinal === 'landscape' ? (PAGE_H[pSize] || 842) : (PAGE_W[pSize] || 595);
    const disponible = pageW - 56; // márgenes 28pt c/lado

    const muestra = rows.slice(0, 200);
    const anchoChar = cols.map(c => {
      const maxDatos = muestra.reduce((m, r) => {
        return Math.max(m, formatearCelda(r[c.campo], c).length);
      }, 0);
      return Math.min(Math.max(c.titulo.length, maxDatos, 4), 30); // [4, 30]
    });
    const sumChar = anchoChar.reduce((a, b) => a + b, 0);
    // ponytail: Helvetica ≈ 0.6×fontSize por char; 4pt de padding lateral por celda.
    const charW   = fontSize * 0.6;
    const ptPV    = (v) => Math.ceil(v * charW + 4); // pt para V chars visibles
    const visGlob = (avail, n) => { for (let v=4;v>=1;v--) if (n*ptPV(v)<=avail) return v; return 1; };

    // Auto-subir a A3 landscape si A4 no garantiza 3 chars por columna.
    let finalDisponible = disponible;
    let finalPSize      = pSize;
    let finalOrient     = orientFinal;
    if (visGlob(disponible, cols.length) < 3 && pSize === 'A4') {
      finalPSize      = 'A3';
      finalOrient     = 'landscape';
      finalDisponible = (PAGE_H['A3'] || 1190) - 56; // 1134pt
    }
    const subidaPagina = finalPSize !== pSize || finalOrient !== orientFinal;

    // Paginación por columnas: si hay demasiadas columnas para mostrar ≥ 6 chars cada una,
    // se dividen en grupos; cada grupo ocupa una página con el ancho completo.
    const maxPerPg  = Math.max(Math.floor(finalDisponible / ptPV(6)), 1);
    const colGroups = cols.length > maxPerPg
      ? Array.from({ length: Math.ceil(cols.length / maxPerPg) },
          (_, k) => cols.slice(k * maxPerPg, (k + 1) * maxPerPg))
      : [cols];

    const buildGrpTable = (grp, isSingleGroup) => {
      const ac = grp.map(c => {
        const md = muestra.reduce((m, r) => Math.max(m, formatearCelda(r[c.campo], c).length), 0);
        return Math.min(Math.max(c.titulo.length, md, 4), 30);
      });
      const sc = ac.reduce((a, b) => a + b, 0);

      // Grupo único que cabe holgado → anchos exactos al contenido, sin estirar a la página.
      const totalContentPt = ac.reduce((s, a) => s + Math.ceil(a * charW) + 6, 0);
      let w;
      if (isSingleGroup && totalContentPt <= finalDisponible) {
        w = ac.map(a => Math.ceil(a * charW) + 6);
      } else {
        // Híbrido: columnas angostas al mínimo de 4 chars, anchas proporcional al disponible.
        const minW = ptPV(visGlob(finalDisponible, grp.length));
        const rawP = ac.map(a => (a / sc) * finalDisponible);
        const esAng = rawP.map(p => p < minW);
        const nAng  = esAng.filter(Boolean).length;
        const left  = finalDisponible - nAng * minW;
        const wSum  = ac.reduce((s, a, i) => esAng[i] ? s : s + a, 0);
        w = ac.map((a, i) =>
          esAng[i] ? minW : Math.max(Math.round((a / (wSum || 1)) * left), minW)
        );
      }
      const tr = (txt, i) => {
        const max = Math.floor((w[i] - 4) / charW);
        if (max < 1) return '';
        if (txt.length <= max) return txt;
        if (max === 1) return txt[0] || '';
        return txt.substring(0, max - 1) + '…';
      };
      return {
        table: {
          headerRows: 1, dontBreakRows: true, widths: w,
          body: [
            grp.map((c, i) => ({ text: tr(c.titulo, i), style: 'th', alignment: esNum(c.campo) ? 'right' : 'left', noWrap: true })),
            ...rows.map(r => grp.map((c, i) => ({
              text: tr(formatearCelda(r[c.campo], c), i),
              alignment: esNum(c.campo) ? 'right' : 'left',
              noWrap: true,
            })))
          ]
        },
        layout: {
          fillColor: (ri) => (ri === 0 ? '#eef1f5' : (ri % 2 === 0 ? '#fafbfc' : null)),
          hLineWidth: () => 0.4, vLineWidth: () => 0.4,
          hLineColor: () => '#c9d1d9', vLineColor: () => '#c9d1d9'
        }
      };
    };

    const tablasContent = colGroups.map((grp, idx) => ({
      ...buildGrpTable(grp, colGroups.length === 1),
      ...(idx > 0 ? { pageBreak: 'before' } : {})
    }));

    // Cabecera: logo izquierda + nombre grande / info derecha.
    const encabezado = [];
    const textoCrudo = branding?.encabezadoHtml ? quitarHtml(branding.encabezadoHtml) : '';
    const lineas = textoCrudo.split('\n').map(l => l.trim()).filter(Boolean);
    const hayLogo = !!branding?.logoDataUri;
    const hayTexto = lineas.length > 0;
    if (hayLogo || hayTexto) {
      const textoStack = hayTexto ? {
        stack: [
          { text: lineas[0], style: 'empresaNombre' },
          ...lineas.slice(1).map(l => ({ text: l, style: 'empresaInfo' }))
        ]
      } : null;
      if (hayLogo && hayTexto) {
        encabezado.push({
          columns: [
            { image: branding.logoDataUri, fit: [100, 48], width: 'auto' },
            { ...textoStack, margin: [10, 0, 0, 0] }
          ],
          margin: [0, 0, 0, 8]
        });
      } else if (hayLogo) {
        encabezado.push({ image: branding.logoDataUri, fit: [110, 46], margin: [0, 0, 0, 8] });
      } else {
        encabezado.push({ ...textoStack, margin: [0, 0, 0, 8] });
      }
    }

    const doc = {
      pageSize: finalPSize,
      pageOrientation: finalOrient,
      pageMargins: [28, 30, 28, 40],
      defaultStyle: { font: 'Helvetica', fontSize },
      content: [
        ...encabezado,
        { text: titulo, style: 'titulo' },
        ...(subtitulo ? [{ text: subtitulo, style: 'subtitulo' }] : []),
        ...(totalFilas > MAX_PDF_FILAS ? [{ text: `NOTA: Se muestran ${MAX_PDF_FILAS.toLocaleString()} de ${totalFilas.toLocaleString()} filas. Para el dataset completo use Excel o CSV.`, style: 'aviso' }] : []),
        ...(subidaPagina ? [{ text: `NOTA: El PDF se generó en ${finalPSize} horizontal por la cantidad de columnas (${cols.length}).`, style: 'aviso' }] : []),
        ...(colGroups.length > 1 ? [{ text: `NOTA: Las ${cols.length} columnas se distribuyen en ${colGroups.length} secciones (una por página).`, style: 'aviso' }] : []),
        ...tablasContent,
        ...(branding?.pieHtml ? [{ text: quitarHtml(branding.pieHtml), style: 'pie' }] : [])
      ],
      footer: (pagina, total) => ({
        columns: [
          { text: new Date().toLocaleString('es-VE'), style: 'pieHoja' },
          { text: `Página ${pagina} de ${total}`, style: 'pieHoja', alignment: 'right' }
        ],
        margin: [28, 8, 28, 0]
      }),
      styles: {
        titulo: { fontSize: 13, bold: true, margin: [0, 2, 0, 6] },
        subtitulo: { fontSize: 8, color: '#57606a', margin: [0, 0, 0, 6] },
        empresaNombre: { fontSize: 13, bold: true, margin: [0, 0, 0, 2] },
        empresaInfo: { fontSize: 8, color: '#444', margin: [0, 0, 0, 1] },
        th: { bold: true },
        aviso: { fontSize: 8, color: '#9a6700', italics: true, margin: [0, 0, 0, 6] },
        pie: { fontSize: 7, color: '#57606a', margin: [0, 8, 0, 0] },
        pieHoja: { fontSize: 7, color: '#8b949e' }
      }
    };

    const printer = new PdfPrinter(FUENTES);
    const pdf = printer.createPdfKitDocument(doc);
    return new Promise((resolve, reject) => {
      const trozos = [];
      pdf.on('data', (t) => trozos.push(t));
      pdf.on('end', () => resolve(Buffer.concat(trozos)));
      pdf.on('error', reject);
      pdf.end();
    });
  }
  */

  _csv(rows, columnas, titulo = 'Reporte', subtitulo = null, branding = null) {
    const cols = resolverColumnas(rows, columnas);
    const q = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const empresa = (branding ? lineasHtml(branding.encabezadoHtml)[0] : '')
      || (subtitulo ? subtitulo.replace(/^Empresa:\s*/i, '') : '');
    const fecha = new Date().toLocaleString('es-PY');
    const head = [
      ...(empresa ? [`# Empresa: ${empresa}`] : []),
      `# Reporte: ${titulo}`,
      `# Generado: ${fecha}`,
      '# ----'
    ];
    const lines = [...head, cols.map(c => q(c.titulo)).join(';')];
    for (const r of rows) lines.push(cols.map(c => q(r[c.campo])).join(';'));
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8'); // BOM para Excel
  }

  async _excel(rows, columnas, titulo = 'Reporte', subtitulo = null, branding = null) {
    const cols = resolverColumnas(rows, columnas);
    const fecha = new Date().toLocaleString('es-PY');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(titulo.slice(0, 31));
    ws.columns = cols.map(() => ({ width: 18 }));

    // Líneas de empresa desde el encabezadoHtml: [0]=nombre, [1..]=dirección/RUC/tel.
    const lineas = branding ? lineasHtml(branding.encabezadoHtml) : [];
    const nombreEmpresa = lineas[0] || (subtitulo ? subtitulo.replace(/^Empresa:\s*/i, '') : '');
    const infoExtra = lineas.slice(1); // hasta 3 líneas adicionales

    // Logo embebido (png/jpeg/gif solamente — ExcelJS no soporta SVG ni webp).
    let logoEmbebido = false;
    if (branding?.logoDataUri) {
      const m = /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/s.exec(branding.logoDataUri);
      if (m) {
        const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
        try {
          const imgId = wb.addImage({ base64: m[2], extension: ext });
          // 2 filas de 34pt = 68pt ≈ 90px, justo para el logo sin espacio vacío extra.
          ws.addRow([]); ws.addRow([]);
          ws.getRow(1).height = 34;
          ws.getRow(2).height = 34;
          ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 240, height: 90 } });
          logoEmbebido = true;
        } catch { /* imagen no válida — se omite sin romper la exportación */ }
      }
    }

    // Nombre empresa (bold) + líneas adicionales (dirección, RUC, teléfono…).
    if (nombreEmpresa) {
      ws.addRow([nombreEmpresa]).getCell(1).font = logoEmbebido
        ? { bold: true, size: 12 }
        : { bold: true, size: 14 };
    }
    for (const l of infoExtra) {
      ws.addRow([l]).getCell(1).font = { size: 9, color: { argb: 'FF555555' } };
    }

    ws.addRow([]); // separador
    ws.addRow([titulo]).getCell(1).font = { bold: true, size: 12 };
    ws.addRow([`Generado el: ${fecha}`]).getCell(1).font = { size: 9, color: { argb: 'FF888888' } };
    ws.addRow([]); // separador antes de headers

    ws.addRow(cols.map(c => c.titulo)).font = { bold: true };
    rows.forEach(r => ws.addRow(cols.map(c => r[c.campo])));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  _xml(rows, columnas) {
    const cols = resolverColumnas(rows, columnas);
    const body = rows.map(r =>
      '  <fila>' + cols.map(c => `<${c.campo}>${esc(r[c.campo])}</${c.campo}>`).join('') + '</fila>'
    ).join('\n');
    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<reporte>\n${body}\n</reporte>`, 'utf8');
  }

  _html(rows, columnas, titulo, branding) {
    const cols = resolverColumnas(rows, columnas);
    const head = branding ? `
      <header style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:12px">
        ${branding.logoDataUri ? `<img src="${branding.logoDataUri}" style="max-height:64px">` : ''}
        <div>${branding.encabezadoHtml || ''}</div>
      </header>` : '';
    const foot = branding && branding.pieHtml
      ? `<footer style="margin-top:12px;border-top:1px solid #ccc;padding-top:8px">${branding.pieHtml}</footer>` : '';
    const thead = '<tr>' + cols.map(c => `<th>${esc(c.titulo)}</th>`).join('') + '</tr>';
    const tbody = rows.map(r => '<tr>' + cols.map(c => `<td>${esc(formatearCelda(r[c.campo], c))}</td>`).join('') + '</tr>').join('');
    return Buffer.from(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222}
h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f2f2f2}</style>
</head><body>${head}<h1>${esc(titulo)}</h1>
<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>${foot}</body></html>`, 'utf8');
  }
}

module.exports = new ExportService();
