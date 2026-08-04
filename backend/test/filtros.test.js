'use strict';
/**
 * Filtros a medio configurar.
 *
 * Al pulsar «Añadir filtro» la fila nace vacía: si se enviara al servidor, la
 * validación la rechazaría y el usuario vería un error alarmante sin haber
 * hecho nada mal. Estas pruebas fijan que solo se envían los filtros completos.
 *
 * Réplica de la lógica de frontend/src/components/WidgetView.jsx.
 * Ejecutar: node test/filtros.test.js
 */
const assert = require('assert');

function filtrosCompletos(filtros) {
  return (filtros || []).filter(f => {
    if (!f.campo) return false;
    if (f.operador === 'ENTRE') return f.desde !== '' && f.desde != null
                                    && f.hasta !== '' && f.hasta != null;
    return f.valor !== '' && f.valor != null;
  });
}

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};
const pasa = (f) => filtrosCompletos([f]).length === 1;

console.log('\nFiltros incompletos: no deben enviarse');

test('el filtro recién añadido se ignora', () =>
  assert.strictEqual(pasa({ campo: '', operador: 'IGUAL', valor: '' }), false));

test('con atributo pero sin valor se ignora', () =>
  assert.strictEqual(pasa({ campo: 'VENTASDETALLE.CODALMACEN', operador: 'IGUAL', valor: '' }), false));

test('con valor pero sin atributo se ignora', () =>
  assert.strictEqual(pasa({ campo: '', operador: 'IGUAL', valor: 'ZZA' }), false));

test('valor nulo se ignora', () =>
  assert.strictEqual(pasa({ campo: 'X.Y', operador: 'IGUAL', valor: null }), false));

test('ENTRE con un solo extremo se ignora', () =>
  assert.strictEqual(pasa({ campo: 'X.FECHA', operador: 'ENTRE', desde: '2020-01-01', hasta: '' }), false));

console.log('\nFiltros completos: sí se envían');

test('filtro completo pasa', () =>
  assert.strictEqual(pasa({ campo: 'VENTASDETALLE.CODALMACEN', operador: 'IGUAL', valor: 'ZZA' }), true));

test('ENTRE con ambos extremos pasa', () =>
  assert.strictEqual(pasa({ campo: 'X.FECHA', operador: 'ENTRE',
    desde: '2020-01-01', hasta: '2030-12-31' }), true));

// El cero es un valor legítimo: no debe confundirse con "vacío".
test('el valor cero es válido', () =>
  assert.strictEqual(pasa({ campo: 'X.UNIDADES', operador: 'MAYOR', valor: 0 }), true));

test('el texto "0" es válido', () =>
  assert.strictEqual(pasa({ campo: 'X.UNIDADES', operador: 'MAYOR', valor: '0' }), true));

test('mezcla: solo sobreviven los completos', () => {
  const r = filtrosCompletos([
    { campo: '', operador: 'IGUAL', valor: '' },
    { campo: 'A.B', operador: 'IGUAL', valor: '1' },
    { campo: 'C.D', operador: 'IGUAL', valor: '' }
  ]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].campo, 'A.B');
});

test('sin filtros no falla', () => {
  assert.deepStrictEqual(filtrosCompletos(undefined), []);
  assert.deepStrictEqual(filtrosCompletos([]), []);
});

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
