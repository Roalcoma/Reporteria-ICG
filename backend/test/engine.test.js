'use strict';
/**
 * Pruebas del motor de plantillas (anti-inyección) y del cálculo de cron.
 * No requieren base de datos.  Ejecutar:  node test/engine.test.js
 */
const assert = require('assert');
const engine = require('../src/engine/queryTemplateEngine');
const { proximaEjecucion, validarCron } = require('../src/services/cronUtil');

/** Request falso de node-mssql: registra los parámetros enlazados. */
function fakeRequest() {
  return { params: {}, input(n, t, v) { this.params[n] = v; return this; } };
}

let ok = 0;
const test = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

console.log('\nqueryTemplateEngine — parámetros enlazados');

test('un valor escalar se convierte en @parámetro, no se concatena', () => {
  const req = fakeRequest();
  const defs = [{ Nombre: 'CODART', TipoDato: 'STRING', Clase: 'VALOR', ControlUI: 'TEXTO' }];
  const out = engine.build('SELECT * FROM ARTICULOS WHERE CODARTICULO = {CODART}',
    defs, { CODART: 'A100' }, req);
  assert.strictEqual(out, 'SELECT * FROM ARTICULOS WHERE CODARTICULO = @CODART');
  assert.strictEqual(req.params.CODART, 'A100');
});

test('intento de inyección viaja como DATO literal, no como SQL', () => {
  const req = fakeRequest();
  const defs = [{ Nombre: 'CODART', TipoDato: 'STRING', Clase: 'VALOR', ControlUI: 'TEXTO' }];
  const malicioso = "x'; DROP TABLE ARTICULOS; --";
  const out = engine.build('SELECT * FROM ARTICULOS WHERE CODARTICULO = {CODART}',
    defs, { CODART: malicioso }, req);
  // El SQL final NO contiene el payload: quedó enlazado como valor.
  assert.ok(!out.includes('DROP'), 'el SQL no debe contener el payload');
  assert.strictEqual(req.params.CODART, malicioso);
});

test('multiselección usa STRING_SPLIT con un solo parámetro enlazado', () => {
  const req = fakeRequest();
  const defs = [{ Nombre: 'VEND', TipoDato: 'STRING', Clase: 'VALOR',
    ControlUI: 'LISTA_ESTATICA', PermiteMultiple: true }];
  const out = engine.build('SELECT * FROM V WHERE COD IN ({VEND})',
    defs, { VEND: ['1', '2', '3'] }, req);
  assert.ok(out.includes('STRING_SPLIT(@VEND'), 'debe usar STRING_SPLIT');
  assert.strictEqual(Object.keys(req.params).length, 1, 'un solo parámetro enlazado');
});

test('IDENTIFICADOR fuera de la whitelist es rechazado', () => {
  const req = fakeRequest();
  const defs = [{ Nombre: 'ORDEN', TipoDato: 'STRING', Clase: 'IDENTIFICADOR',
    ControlUI: 'LISTA_ESTATICA', opciones: [{ Valor: 'FECHA' }, { Valor: 'TOTAL' }] }];
  assert.throws(
    () => engine.build('SELECT * FROM V ORDER BY {ORDEN}', defs, { ORDEN: 'FECHA; DROP TABLE X' }, req),
    /Identificador no permitido/);
});

test('IDENTIFICADOR en whitelist se emite entre corchetes', () => {
  const req = fakeRequest();
  const defs = [{ Nombre: 'ORDEN', TipoDato: 'STRING', Clase: 'IDENTIFICADOR',
    ControlUI: 'LISTA_ESTATICA', opciones: [{ Valor: 'FECHA' }, { Valor: 'TOTAL' }] }];
  const out = engine.build('SELECT * FROM V ORDER BY {ORDEN}', defs, { ORDEN: 'TOTAL' }, req);
  assert.strictEqual(out, 'SELECT * FROM V ORDER BY [TOTAL]');
});

test('se rechaza SQL que no sea SELECT', () => {
  // La guarda (sqlGuard) exige que todo reporte comience por SELECT o WITH.
  assert.throws(() => engine.build('DELETE FROM ARTICULOS', [], {}, fakeRequest()),
    /SELECT o WITH/);
});

test('parámetro obligatorio faltante lanza error', () => {
  const defs = [{ Nombre: 'F', TipoDato: 'DATE', Clase: 'VALOR', ControlUI: 'FECHA', Obligatorio: true }];
  assert.throws(() => engine.build('SELECT {F}', defs, {}, fakeRequest()), /obligatorio/i);
});

test('token no definido en el reporte lanza error', () => {
  assert.throws(() => engine.build('SELECT {NOEXISTE}', [], {}, fakeRequest()), /no definido/);
});

console.log('\ncronUtil — cálculo de próximas ejecuciones');

test('cron de 7:00 lunes a viernes produce una fecha futura', () => {
  const base = new Date('2026-08-03T10:00:00');
  const prox = proximaEjecucion('0 7 * * 1-5', base);
  assert.ok(prox > base, 'la próxima corrida debe ser posterior a la base');
  assert.strictEqual(prox.getHours(), 7);
});

test('cron inválido se detecta sin lanzar', () => {
  assert.strictEqual(validarCron('esto no es cron').valida, false);
  assert.strictEqual(validarCron('*/15 * * * *').valida, true);
});

console.log(`\n${ok} pruebas OK\n`);
