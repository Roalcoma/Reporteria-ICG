'use strict';
/**
 * Pruebas del análisis previo a importar una definición.
 * Se sustituyen los accesos a BD por dobles en memoria.
 * Ejecutar: node test/portabilidad.test.js
 */
const assert = require('assert');
const portabilidad = require('../src/services/portabilidadService');
const cm = require('../src/db/connectionManager');

let ok = 0, fallos = 0;
const testAsync = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

/** Simula la BD: la consulta de nombres duplicados devuelve `duplicados`. */
function simular({ duplicados = false } = {}) {
  cm.getConfigPool = async () => ({
    request: () => ({
      input() { return this; },
      query: async () => ({ recordset: duplicados ? [{ ReporteId: 7 }] : [] })
    })
  });
}

const bundleBase = (extra = {}) => ({
  formato: 'icg-reporteria/v1',
  reporte: { Nombre: 'Ventas por vendedor', Tipo: 'SIMPLE', Area: 'GESTION' },
  consultas: [{ Rol: 'FLAT', SqlText: 'SELECT * FROM VENTAS WHERE F = {FECHA}' }],
  parametros: [{ Nombre: 'FECHA', TipoDato: 'DATE', ControlUI: 'FECHA' }],
  columnas: [],
  ...extra
});

(async () => {
  console.log('\nPortabilidad: análisis previo a importar');

  await testAsync('bundle correcto se acepta y se resume', async () => {
    simular();
    const r = await portabilidad.analizar(bundleBase());
    assert.strictEqual(r.valido, true, JSON.stringify(r.problemas));
    assert.strictEqual(r.resumen.nombre, 'Ventas por vendedor');
    assert.deepStrictEqual(r.resumen.consultas, ['FLAT']);
    assert.deepStrictEqual(r.resumen.parametros, ['FECHA']);
  });

  await testAsync('formato desconocido se rechaza', async () => {
    simular();
    await assert.rejects(() => portabilidad.analizar({ formato: 'otra-cosa/v9' }),
      /Formato desconocido/);
  });

  await testAsync('archivo que no es una definición se rechaza', async () => {
    simular();
    await assert.rejects(() => portabilidad.analizar(null), /definición válida/);
  });

  await testAsync('SQL peligroso en el archivo se detecta como ERROR', async () => {
    simular();
    const r = await portabilidad.analizar(bundleBase({
      consultas: [{ Rol: 'FLAT', SqlText: 'SELECT * FROM T; DROP TABLE T' }]
    }));
    assert.strictEqual(r.valido, false);
    assert.ok(r.problemas.some(p => p.nivel === 'ERROR'), 'debe reportar un error');
  });

  await testAsync('un reporte basado en SP se importa sin registrarlo antes', async () => {
    simular();
    const r = await portabilidad.analizar(bundleBase({
      consultas: [{ Rol: 'FLAT', SqlText: 'EXEC dbo.REP_VENTASDIARIAS @D = {FECHA}' }]
    }));
    assert.strictEqual(r.valido, true, JSON.stringify(r.problemas));
  });

  await testAsync('un SP del sistema en el archivo bloquea la importación', async () => {
    simular();
    const r = await portabilidad.analizar(bundleBase({
      consultas: [{ Rol: 'FLAT', SqlText: "EXEC xp_cmdshell 'dir'" }]
    }));
    assert.strictEqual(r.valido, false);
  });

  await testAsync('nombre repetido es AVISO, no impide importar', async () => {
    simular({ duplicados: true });
    const r = await portabilidad.analizar(bundleBase());
    assert.strictEqual(r.valido, true, 'un duplicado no debe bloquear');
    assert.ok(r.problemas.some(p => p.nivel === 'AVISO'), 'debe avisar del duplicado');
  });

  await testAsync('bundle sin consultas se rechaza', async () => {
    simular();
    const r = await portabilidad.analizar(bundleBase({ consultas: [] }));
    assert.strictEqual(r.valido, false);
  });

  await testAsync('SQL del origen de una LISTA_SQL también se revisa', async () => {
    simular();
    const r = await portabilidad.analizar(bundleBase({
      parametros: [{ Nombre: 'V', ControlUI: 'LISTA_SQL', SqlOrigen: 'DELETE FROM VENDEDORES' }]
    }));
    assert.strictEqual(r.valido, false);
  });

  console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  process.exit(fallos ? 1 : 0);
})();
