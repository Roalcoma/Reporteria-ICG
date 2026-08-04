'use strict';
/**
 * Pruebas de exportación, incluyendo la inyección de branding en HTML.
 * No requieren base de datos.  Ejecutar: node test/export.test.js
 */
const assert = require('assert');
const exportService = require('../src/services/exportService');

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};
const testAsync = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

const FILAS = [
  { CODARTICULO: 'A1', DESCRIPCION: 'Zapato "deportivo"', TOTAL: 1234.5 },
  { CODARTICULO: 'A2', DESCRIPCION: 'Camisa; rayada', TOTAL: 99 }
];
const COLUMNAS = [
  { NombreCampo: 'CODARTICULO', AliasVisible: 'Código', VisiblePorDefecto: true },
  { NombreCampo: 'DESCRIPCION', AliasVisible: 'Descripción', VisiblePorDefecto: true },
  { NombreCampo: 'TOTAL', AliasVisible: 'Total', VisiblePorDefecto: true },
  { NombreCampo: 'INTERNO', AliasVisible: 'Interno', VisiblePorDefecto: false }
];
// Logo PNG mínimo (1x1 transparente).
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
  console.log('\nExportación: formatos');

  await testAsync('CSV usa alias y respeta columnas ocultas', async () => {
    const buf = await exportService.exportar('CSV', FILAS, COLUMNAS, {});
    const txt = buf.toString('utf8');
    assert.ok(txt.includes('Código;Descripción;Total'), 'encabezados con alias');
    assert.ok(!txt.includes('Interno'), 'la columna oculta no se exporta');
    assert.ok(txt.includes('"Camisa; rayada"'), 'entrecomilla valores con separador');
  });

  await testAsync('JSON devuelve las filas', async () => {
    const buf = await exportService.exportar('JSON', FILAS, COLUMNAS, {});
    assert.strictEqual(JSON.parse(buf.toString('utf8')).length, 2);
  });

  await testAsync('XML escapa el contenido', async () => {
    const buf = await exportService.exportar('XML', FILAS, COLUMNAS, {});
    const txt = buf.toString('utf8');
    assert.ok(txt.includes('<reporte>'), 'raíz');
    assert.ok(txt.includes('&quot;') || txt.includes('&#39;') || !txt.includes('"deportivo"'),
      'las comillas se escapan');
  });

  await testAsync('Excel genera un archivo válido (cabecera ZIP)', async () => {
    const buf = await exportService.exportar('EXCEL', FILAS, COLUMNAS, { titulo: 'Prueba' });
    assert.strictEqual(buf[0], 0x50, 'xlsx empieza con PK');
    assert.strictEqual(buf[1], 0x4b);
  });

  console.log('\nExportación HTML con branding');

  await testAsync('sin branding no hay encabezado institucional', async () => {
    const buf = await exportService.exportar('HTML', FILAS, COLUMNAS, { titulo: 'Ventas' });
    const html = buf.toString('utf8');
    assert.ok(html.includes('<table'), 'incluye la tabla');
    assert.ok(!html.includes('<header'), 'no debe haber header sin branding');
  });

  await testAsync('con branding incrusta logo, encabezado y pie', async () => {
    const buf = await exportService.exportar('HTML', FILAS, COLUMNAS, {
      titulo: 'Ventas',
      branding: {
        logoDataUri: LOGO,
        encabezadoHtml: '<strong>INVERSIONES LOS ARENAS</strong>',
        pieHtml: 'Generado automáticamente'
      }
    });
    const html = buf.toString('utf8');
    assert.ok(html.includes('<header'), 'incluye el encabezado');
    assert.ok(html.includes('data:image/png;base64'), 'el logo va incrustado (sin URL externa)');
    assert.ok(html.includes('INVERSIONES LOS ARENAS'), 'texto del encabezado');
    assert.ok(html.includes('Generado automáticamente'), 'texto del pie');
    assert.ok(html.includes('Ventas'), 'título del reporte');
  });

  await testAsync('el HTML escapa los datos de las filas', async () => {
    const buf = await exportService.exportar('HTML', [{ X: '<script>alert(1)</script>' }],
      [{ NombreCampo: 'X', AliasVisible: 'X', VisiblePorDefecto: true }], {});
    const html = buf.toString('utf8');
    assert.ok(!html.includes('<script>alert'), 'no debe inyectarse script desde los datos');
    assert.ok(html.includes('&lt;script&gt;'), 'se escapa');
  });

  console.log('\nExportación a PDF');

  await testAsync('genera un PDF válido', async () => {
    const buf = await exportService.exportar('PDF', FILAS, COLUMNAS, { titulo: 'Ventas' });
    // Todo PDF empieza por "%PDF-" y termina con "%%EOF".
    assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-', 'cabecera PDF');
    assert.ok(buf.subarray(-1024).toString('latin1').includes('%%EOF'), 'cierre del documento');
    assert.ok(buf.length > 800, `parece vacío (${buf.length} bytes)`);
  });

  await testAsync('respeta la orientación horizontal', async () => {
    const v = await exportService.exportar('PDF', FILAS, COLUMNAS,
      { titulo: 'X', orientacion: 'VERTICAL', tamanoHoja: 'A4' });
    const h = await exportService.exportar('PDF', FILAS, COLUMNAS,
      { titulo: 'X', orientacion: 'HORIZONTAL', tamanoHoja: 'A4' });
    // El MediaBox lleva las dimensiones: en horizontal el ancho supera al alto.
    const medida = (buf) => {
      const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(buf.toString('latin1'));
      return m ? { ancho: parseFloat(m[1]), alto: parseFloat(m[2]) } : null;
    };
    const mv = medida(v), mh = medida(h);
    assert.ok(mv && mh, 'no se pudo leer el tamaño de página');
    assert.ok(mv.alto > mv.ancho, `vertical: ${mv.ancho}x${mv.alto}`);
    assert.ok(mh.ancho > mh.alto, `horizontal: ${mh.ancho}x${mh.alto}`);
  });

  await testAsync('respeta el tamaño de hoja', async () => {
    const medidaAncho = (buf) => {
      const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)/.exec(buf.toString('latin1'));
      return m ? parseFloat(m[1]) : 0;
    };
    const a4 = await exportService.exportar('PDF', FILAS, COLUMNAS, { tamanoHoja: 'A4' });
    const a3 = await exportService.exportar('PDF', FILAS, COLUMNAS, { tamanoHoja: 'A3' });
    assert.ok(medidaAncho(a3) > medidaAncho(a4),
      `A3 debe ser más ancho que A4 (${medidaAncho(a3)} vs ${medidaAncho(a4)})`);
  });

  await testAsync('una hoja desconocida cae en A4 sin fallar', async () => {
    const buf = await exportService.exportar('PDF', FILAS, COLUMNAS, { tamanoHoja: 'INVENTADO' });
    assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  await testAsync('el PDF admite branding y acentos', async () => {
    const buf = await exportService.exportar('PDF',
      [{ A: 'Camión español', B: 1 }],
      [{ NombreCampo: 'A', AliasVisible: 'Descripción', VisiblePorDefecto: true },
       { NombreCampo: 'B', AliasVisible: 'Nº', VisiblePorDefecto: true, Formato: 'ENTERO' }],
      { titulo: 'Informe de gestión', branding: {
          logoDataUri: LOGO, encabezadoHtml: '<strong>MI EMPRESA</strong><br>RIF J-123',
          pieHtml: 'Documento generado automáticamente' } });
    assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(buf.length > 1200, 'con logo y encabezado debe pesar más');
  });

  await testAsync('sin filas genera igualmente el documento', async () => {
    const buf = await exportService.exportar('PDF', [], COLUMNAS, { titulo: 'Vacío' });
    assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  await testAsync('formato desconocido se rechaza', async () => {
    // Antes se usaba PDF como ejemplo; ahora es un formato admitido.
    await assert.rejects(() => exportService.exportar('DOCX', FILAS, COLUMNAS, {}),
      /no soportado/i);
  });

  console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  process.exit(fallos ? 1 : 0);
})();
