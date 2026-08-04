'use strict';
/**
 * Pruebas del formato sugerido segun el tipo SQL de la columna.
 * Ejecutar: node test/formato.test.js
 */
const assert = require('assert');
const { sugerirFormato } = require('../src/services/reporteService');

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

console.log('\nFormato sugerido por tipo SQL');

const casos = [
  ['int', null, 'ENTERO'],
  ['bigint', null, 'ENTERO'],
  ['smallint', null, 'ENTERO'],
  ['decimal(18,2)', 2, 'NUMERO'],
  ['numeric(10,4)', 4, 'NUMERO'],
  ['decimal(18,0)', 0, 'ENTERO'],
  ['money', null, 'MONEDA'],
  ['smallmoney', null, 'MONEDA'],
  ['date', null, 'FECHA'],
  ['datetime', null, 'FECHA'],
  ['datetime2', null, 'FECHA'],
  ['nvarchar(50)', null, 'TEXTO'],
  ['varchar(max)', null, 'TEXTO'],
  ['bit', null, 'TEXTO'],
  ['', null, 'TEXTO'],
  [null, null, 'TEXTO']
];

for (const [tipo, escala, esperado] of casos) {
  test(`${tipo || '(sin tipo)'} → ${esperado}`, () => {
    assert.strictEqual(sugerirFormato(tipo, escala), esperado);
  });
}

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
