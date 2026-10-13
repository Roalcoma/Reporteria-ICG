'use strict';
/**
 * Pruebas del actualizador y del separador de lotes de las migraciones.
 * Ejecutar: node test/actualizacion.test.js
 */
const assert = require('assert');
const { lotes } = require('../src/db/migraciones');
const { compararVersion } = require('../src/services/actualizacionService');

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

console.log('\nComparación de versiones');
test('tag con v mayor que la local', () => assert.strictEqual(compararVersion('v0.7.3', '0.7.2'), 1));
test('misma versión con y sin v', () => assert.strictEqual(compararVersion('v0.7.3', '0.7.3'), 0));
test('una release vieja no es actualización', () => assert.strictEqual(compararVersion('v0.7.2', '0.7.3'), -1));
test('compara numéricamente, no como texto', () => assert.strictEqual(compararVersion('v0.10.0', '0.9.9'), 1));

console.log('\nSeparación de scripts SQL en lotes');
test('separa por GO sin importar mayúsculas ni espacios', () => {
  assert.deepStrictEqual(lotes('SELECT 1\nGO\nSELECT 2\n  go  \nSELECT 3'), ['SELECT 1', 'SELECT 2', 'SELECT 3']);
});
test('quita los USE para correr en la BD configurada', () => {
  assert.deepStrictEqual(lotes('USE ICG_Reporteria_Config;\nGO\nCREATE TABLE x (a INT)\nGO'), ['CREATE TABLE x (a INT)']);
});
test('no corta en palabras que contienen GO', () => {
  assert.deepStrictEqual(lotes("SELECT 'GOTO' AS GOAL\nGO"), ["SELECT 'GOTO' AS GOAL"]);
});
test('ignora el BOM y los lotes vacíos', () => {
  assert.deepStrictEqual(lotes('﻿SELECT 1\nGO\n\nGO\n'), ['SELECT 1']);
});
test('el script 13 real produce un solo lote', () => {
  const fs = require('fs');
  const txt = fs.readFileSync(require('path').join(__dirname, '../../db/13_vista_prefs.sql'), 'utf8');
  const l = lotes(txt);
  assert.strictEqual(l.length, 1);
  assert.match(l[0], /ALTER TABLE rep\.Reporte ADD VistaJson/);
});

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
