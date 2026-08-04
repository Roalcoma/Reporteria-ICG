'use strict';
/**
 * Periodos relativos de fecha.
 *
 * Se resuelven en el servidor para que «este mes» siga significando el mes en
 * curso cada vez que se abre el panel, sin reescribir fechas a mano.
 *
 * Ejecutar: node test/periodos.test.js
 */
const assert = require('assert');
const { resolverPeriodo, PERIODOS } = require('../src/engine/semanticQuery');

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};
const soloFecha = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hoy = soloFecha(new Date());
const dias = (a, b) => Math.round((b - a) / 86400000);

console.log('\nPeriodos relativos');

test('todos los periodos declarados se resuelven', () => {
  for (const clave of Object.keys(PERIODOS)) {
    const r = resolverPeriodo(clave);
    assert.ok(Array.isArray(r) && r.length === 2, `${clave} debe dar un rango`);
    assert.ok(r[0] <= r[1], `${clave}: el inicio no puede ser posterior al fin`);
  }
});

test('HOY devuelve el día actual', () => {
  const [d, h] = resolverPeriodo('HOY');
  assert.strictEqual(d.getTime(), hoy.getTime());
  assert.strictEqual(h.getTime(), hoy.getTime());
});

test('AYER es el día anterior', () => {
  const [d] = resolverPeriodo('AYER');
  assert.strictEqual(dias(d, hoy), 1);
});

test('ULTIMOS_7 abarca 7 días contando hoy', () => {
  const [d, h] = resolverPeriodo('ULTIMOS_7');
  assert.strictEqual(dias(d, h), 6, 'de hace 6 días a hoy son 7 días');
});

test('ULTIMOS_30 abarca 30 días', () => {
  const [d, h] = resolverPeriodo('ULTIMOS_30');
  assert.strictEqual(dias(d, h), 29);
});

test('MES_ACTUAL empieza el día 1 del mes en curso', () => {
  const [d, h] = resolverPeriodo('MES_ACTUAL');
  assert.strictEqual(d.getDate(), 1);
  assert.strictEqual(d.getMonth(), hoy.getMonth());
  assert.strictEqual(h.getTime(), hoy.getTime());
});

test('MES_ANTERIOR cubre el mes completo anterior', () => {
  const [d, h] = resolverPeriodo('MES_ANTERIOR');
  assert.strictEqual(d.getDate(), 1);
  // El fin debe ser el último día de ese mismo mes.
  const ultimoDia = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  assert.strictEqual(h.getDate(), ultimoDia);
  assert.strictEqual(d.getMonth(), h.getMonth(), 'inicio y fin en el mismo mes');
});

test('ANIO_ACTUAL empieza el 1 de enero', () => {
  const [d] = resolverPeriodo('ANIO_ACTUAL');
  assert.strictEqual(d.getMonth(), 0);
  assert.strictEqual(d.getDate(), 1);
  assert.strictEqual(d.getFullYear(), hoy.getFullYear());
});

test('ANIO_ANTERIOR cubre el año completo anterior', () => {
  const [d, h] = resolverPeriodo('ANIO_ANTERIOR');
  assert.strictEqual(d.getFullYear(), hoy.getFullYear() - 1);
  assert.strictEqual(h.getFullYear(), hoy.getFullYear() - 1);
  assert.strictEqual(d.getMonth(), 0);
  assert.strictEqual(h.getMonth(), 11);
  assert.strictEqual(h.getDate(), 31);
});

test('SEMANA_ACTUAL empieza en lunes', () => {
  const [d] = resolverPeriodo('SEMANA_ACTUAL');
  assert.strictEqual(d.getDay(), 1, 'la semana ISO empieza el lunes');
  assert.ok(d <= hoy);
});

test('TRIMESTRE_ACTUAL empieza en enero, abril, julio u octubre', () => {
  const [d] = resolverPeriodo('TRIMESTRE_ACTUAL');
  assert.ok([0, 3, 6, 9].includes(d.getMonth()), `mes de inicio inesperado: ${d.getMonth()}`);
  assert.strictEqual(d.getDate(), 1);
});

test('un periodo desconocido devuelve null', () => {
  assert.strictEqual(resolverPeriodo('LA_SEMANA_QUE_VIENE'), null);
  assert.strictEqual(resolverPeriodo(''), null);
  assert.strictEqual(resolverPeriodo(null), null);
});

test('no distingue mayúsculas', () => {
  assert.ok(resolverPeriodo('mes_actual'));
});

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
