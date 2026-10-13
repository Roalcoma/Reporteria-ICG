'use strict';
/**
 * Conversión de la definición cargada (CREATE) a ALTER en el módulo Procedimientos.
 * Ejecutar: node test/procedimientos.test.js
 */
const assert = require('assert');
const { comoAlter } = require('../src/services/procedimientoService');

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

console.log('\nProcedimientos: CREATE → ALTER');
test('CREATE PROCEDURE pasa a ALTER', () =>
  assert.strictEqual(comoAlter('CREATE PROCEDURE dbo.X AS SELECT 1'), 'ALTER PROCEDURE dbo.X AS SELECT 1'));
test('CREATE PROC abreviado', () =>
  assert.strictEqual(comoAlter('create proc dbo.X AS SELECT 1'), 'ALTER PROC dbo.X AS SELECT 1'));
test('CREATE OR ALTER VIEW', () =>
  assert.strictEqual(comoAlter('CREATE OR ALTER VIEW v AS SELECT 1'), 'ALTER VIEW v AS SELECT 1'));
test('ALTER se mantiene', () =>
  assert.strictEqual(comoAlter('ALTER FUNCTION f() RETURNS INT AS BEGIN RETURN 1 END').startsWith('ALTER FUNCTION f()'), true));
test('conserva comentarios previos a la cabecera', () => {
  const r = comoAlter('-- autor: X\n/* nota */\nCREATE PROCEDURE dbo.X AS SELECT 1');
  assert.strictEqual(r, '-- autor: X\n/* nota */\nALTER PROCEDURE dbo.X AS SELECT 1');
});
test('rechaza otra sentencia', () => assert.throws(() => comoAlter('DROP PROCEDURE dbo.X'), /CREATE o ALTER/));
test('rechaza CREATE TABLE', () => assert.throws(() => comoAlter('CREATE TABLE t (a INT)'), /CREATE o ALTER/));
test('rechaza vacío', () => assert.throws(() => comoAlter(''), /CREATE o ALTER/));

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
