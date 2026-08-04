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
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');

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

function resolverColumnas(rows, columnas) {
  const visibles = (columnas || []).filter(c => c.VisiblePorDefecto !== false);
  if (visibles.length) return visibles.map(c => ({ campo: c.NombreCampo, titulo: c.AliasVisible || c.NombreCampo }));
  const first = rows[0] || {};
  return Object.keys(first).map(k => ({ campo: k, titulo: k }));
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
    const { titulo = 'Reporte', branding = null } = opciones;
    switch ((formato || '').toUpperCase()) {
      case 'CSV':   return this._csv(rows, columnas);
      case 'EXCEL': return this._excel(rows, columnas, titulo);
      case 'JSON':  return Buffer.from(JSON.stringify(rows, null, 2), 'utf8');
      case 'XML':   return this._xml(rows, columnas);
      case 'HTML':  return this._html(rows, columnas, titulo, branding);
      case 'PDF':   return this._pdf(rows, columnas, opciones);
      default: throw Object.assign(new Error('Formato no soportado'), { status: 400 });
    }
  }

  /**
   * Documento PDF con el branding de la empresa.
   * La orientación y el tamaño de hoja vienen del reporte, pero se pueden
   * cambiar puntualmente al exportar.
   */
  async _pdf(rows, columnas, { titulo = 'Reporte', branding = null,
    orientacion = 'VERTICAL', tamanoHoja = 'A4', subtitulo = null } = {}) {
    const cols = resolverColumnas(rows, columnas);
    const defs = (columnas || []).filter(c => c.VisiblePorDefecto !== false);
    const esNum = (campo) => {
      const d = defs.find(x => x.NombreCampo === campo);
      return ['ENTERO', 'NUMERO', 'MONEDA', 'PORCENTAJE'].includes(d?.Formato);
    };

    const cuerpo = [
      cols.map(c => ({ text: c.titulo, style: 'th', alignment: esNum(c.campo) ? 'right' : 'left' })),
      ...rows.map(r => cols.map(c => ({
        text: r[c.campo] === null || r[c.campo] === undefined ? '' : String(r[c.campo]),
        alignment: esNum(c.campo) ? 'right' : 'left'
      })))
    ];

    const encabezado = [];
    if (branding?.logoDataUri) {
      encabezado.push({ image: branding.logoDataUri, fit: [110, 46], margin: [0, 0, 0, 4] });
    }
    if (branding?.encabezadoHtml) {
      // El encabezado se guarda como HTML: en PDF se vuelca como texto plano.
      encabezado.push({ text: quitarHtml(branding.encabezadoHtml), style: 'empresa' });
    }

    const doc = {
      pageSize: TAMANOS.includes(String(tamanoHoja).toUpperCase())
        ? String(tamanoHoja).toUpperCase() : 'A4',
      pageOrientation: String(orientacion).toUpperCase() === 'HORIZONTAL' ? 'landscape' : 'portrait',
      pageMargins: [28, 30, 28, 40],
      defaultStyle: { font: 'Helvetica', fontSize: 8 },
      content: [
        ...encabezado,
        { text: titulo, style: 'titulo' },
        ...(subtitulo ? [{ text: subtitulo, style: 'subtitulo' }] : []),
        {
          table: { headerRows: 1, dontBreakRows: true, body: cuerpo },
          layout: {
            fillColor: (i) => (i === 0 ? '#eef1f5' : (i % 2 === 0 ? '#fafbfc' : null)),
            hLineWidth: () => 0.4, vLineWidth: () => 0.4,
            hLineColor: () => '#c9d1d9', vLineColor: () => '#c9d1d9'
          }
        },
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
        empresa: { fontSize: 9, bold: true, margin: [0, 0, 0, 2] },
        th: { bold: true, fontSize: 8 },
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

  _csv(rows, columnas) {
    const cols = resolverColumnas(rows, columnas);
    const q = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines = [cols.map(c => q(c.titulo)).join(';')];
    for (const r of rows) lines.push(cols.map(c => q(r[c.campo])).join(';'));
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8'); // BOM para Excel
  }

  async _excel(rows, columnas, titulo) {
    const cols = resolverColumnas(rows, columnas);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(titulo.slice(0, 31));
    ws.columns = cols.map(c => ({ header: c.titulo, key: c.campo, width: 18 }));
    ws.getRow(1).font = { bold: true };
    rows.forEach(r => ws.addRow(cols.reduce((a, c) => (a[c.campo] = r[c.campo], a), {})));
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
    const tbody = rows.map(r => '<tr>' + cols.map(c => `<td>${esc(r[c.campo])}</td>`).join('') + '</tr>').join('');
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
