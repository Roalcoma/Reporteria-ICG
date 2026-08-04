'use strict';
/**
 * Estructura del panel: pestañas, reordenación y alcance de los filtros.
 * Réplica de la lógica de frontend/src/dashboardUtil.js.
 *
 * Ejecutar: node test/panel.test.js
 */
const assert = require('assert');

function normalizar(cfg) {
  const base = cfg || {};
  const tabs = base.tabs?.length ? base.tabs : [{ id: 'tab1', nombre: 'Panel' }];
  const primera = tabs[0].id;
  return {
    ...base, tabs,
    widgets: (base.widgets || []).map(w => ({
      ancho: 'medio', alto: 'medio', emite: true, recibe: true, ...w, tabId: w.tabId || primera
    })),
    filtros: (base.filtros || []).map(f => ({
      ancho: 'tercio', alto: 'medio', afecta: 'TODOS', ...f, tabId: f.tabId || primera
    }))
  };
}

function filtrosPara(objetoId, objeto, filtros, valoresFiltro, seleccion) {
  if (objeto && objeto.recibe === false) return [];
  const lista = [];
  for (const f of filtros || []) {
    const vals = valoresFiltro[f.id] || [];
    if (!f.campo || !vals.length) continue;
    const alcanza = f.afecta === 'TODOS' || !f.afecta ||
      (Array.isArray(f.afecta) && f.afecta.includes(objetoId));
    if (alcanza) lista.push({ campo: f.campo, operador: 'EN', valor: vals });
  }
  if (seleccion && seleccion.origenId !== objetoId) {
    lista.push({ campo: seleccion.campo, operador: 'IGUAL', valor: seleccion.valor });
  }
  return lista;
}

function reordenar(lista, idOrigen, idDestino) {
  const desde = lista.findIndex(x => x.id === idOrigen);
  const hasta = lista.findIndex(x => x.id === idDestino);
  if (desde < 0 || hasta < 0 || desde === hasta) return lista;
  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movido);
  return copia;
}

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

console.log('\nCompatibilidad con paneles ya guardados');

test('un panel sin pestañas recibe una por defecto', () => {
  const c = normalizar({ widgets: [{ id: 'w1', tipo: 'bar' }] });
  assert.strictEqual(c.tabs.length, 1);
  assert.strictEqual(c.widgets[0].tabId, c.tabs[0].id, 'el objeto queda en la primera pestaña');
});

test('los objetos antiguos reciben tamaño e interacción por defecto', () => {
  const c = normalizar({ widgets: [{ id: 'w1', tipo: 'bar' }] });
  assert.strictEqual(c.widgets[0].ancho, 'medio');
  assert.strictEqual(c.widgets[0].emite, true);
  assert.strictEqual(c.widgets[0].recibe, true);
});

test('no se pisan los valores ya definidos', () => {
  const c = normalizar({ widgets: [{ id: 'w1', ancho: 'completo', recibe: false }] });
  assert.strictEqual(c.widgets[0].ancho, 'completo');
  assert.strictEqual(c.widgets[0].recibe, false);
});

test('configuración vacía no rompe', () => {
  const c = normalizar(null);
  assert.strictEqual(c.tabs.length, 1);
  assert.deepStrictEqual(c.widgets, []);
});

console.log('\nAlcance de los filtros');

const FILTROS = [
  { id: 'f1', campo: 'VENTASDETALLE.CODALMACEN', afecta: 'TODOS' },
  { id: 'f2', campo: 'ARTICULOS.FAMILIA', afecta: ['w2'] }
];
const VALORES = { f1: ['ZZA'], f2: ['10'] };

test('un filtro global alcanza a cualquier objeto', () => {
  const r = filtrosPara('w1', { recibe: true }, FILTROS, VALORES, null);
  assert.ok(r.some(x => x.campo === 'VENTASDETALLE.CODALMACEN'));
});

test('un filtro dirigido solo alcanza a los elegidos', () => {
  const enW1 = filtrosPara('w1', { recibe: true }, FILTROS, VALORES, null);
  const enW2 = filtrosPara('w2', { recibe: true }, FILTROS, VALORES, null);
  assert.ok(!enW1.some(x => x.campo === 'ARTICULOS.FAMILIA'), 'w1 no debe recibirlo');
  assert.ok(enW2.some(x => x.campo === 'ARTICULOS.FAMILIA'), 'w2 sí debe recibirlo');
});

test('un objeto marcado como fijo no recibe ningún filtro', () => {
  const r = filtrosPara('w1', { recibe: false }, FILTROS, VALORES, null);
  assert.deepStrictEqual(r, []);
});

test('un filtro sin valores marcados no se aplica', () => {
  const r = filtrosPara('w1', { recibe: true }, FILTROS, {}, null);
  assert.deepStrictEqual(r, []);
});

test('el filtro usa el operador EN con la lista de valores', () => {
  const r = filtrosPara('w1', { recibe: true }, FILTROS, { f1: ['ZZA', 'ZZV'] }, null);
  assert.strictEqual(r[0].operador, 'EN');
  assert.deepStrictEqual(r[0].valor, ['ZZA', 'ZZV']);
});

console.log('\nSelección por clic (filtrado cruzado)');

const SEL = { campo: 'ARTICULOS.DPTO', valor: '2', origenId: 'w1' };

test('la selección alcanza a los demás objetos', () => {
  const r = filtrosPara('w2', { recibe: true }, [], {}, SEL);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].operador, 'IGUAL');
});

test('el objeto que originó la selección no se filtra a sí mismo', () => {
  const r = filtrosPara('w1', { recibe: true }, [], {}, SEL);
  assert.deepStrictEqual(r, [], 'si se filtrase a sí mismo quedaría una sola barra');
});

console.log('\nReordenar arrastrando');

const LISTA = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (l) => l.map(x => x.id).join('');

test('mover el primero al final', () =>
  assert.strictEqual(ids(reordenar(LISTA, 'a', 'c')), 'bca'));
test('mover el último al principio', () =>
  assert.strictEqual(ids(reordenar(LISTA, 'c', 'a')), 'cab'));
test('soltar sobre sí mismo no cambia nada', () =>
  assert.strictEqual(ids(reordenar(LISTA, 'b', 'b')), 'abc'));
test('un id inexistente no altera la lista', () =>
  assert.strictEqual(ids(reordenar(LISTA, 'z', 'a')), 'abc'));

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
