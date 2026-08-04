'use strict';
/**
 * Campos alcanzables por relación.
 *
 * Es lo que permite que, al elegir una métrica de VENTASDETALLE, el usuario vea
 * de inmediato la descripción o la familia del artículo sin saber que detrás
 * hay otra tabla.
 *
 * Réplica de la lógica de frontend/src/catalogoUtil.js.
 * Ejecutar: node test/relaciones.test.js
 */
const assert = require('assert');

function camposAlcanzables(catalogo, clavesOrigen = []) {
  const porClave = new Map((catalogo?.origenes || []).map(o => [o.clave, o]));
  const relaciones = catalogo?.relaciones || [];
  const directos = new Set(clavesOrigen.filter(Boolean));
  const alcanzados = new Map();
  for (const clave of directos) {
    for (const r of relaciones) {
      if (r.izq === clave && !directos.has(r.der)) alcanzados.set(r.der, clave);
      if (r.der === clave && !directos.has(r.izq)) alcanzados.set(r.izq, clave);
    }
  }
  const campos = [];
  const añadir = (o, via, desde) => {
    for (const c of o.campos || []) campos.push({ ...c, origen: o.clave, viaRelacion: via, desde });
  };
  if (!directos.size) {
    for (const o of catalogo?.origenes || []) añadir(o, false, null);
    return { campos, origenes: (catalogo?.origenes || []).map(o => o.clave) };
  }
  for (const c of directos) { const o = porClave.get(c); if (o) añadir(o, false, null); }
  for (const [c, desde] of alcanzados) { const o = porClave.get(c); if (o) añadir(o, true, desde); }
  return { campos, origenes: [...directos, ...alcanzados.keys()] };
}

// Catálogo reducido con la misma forma que el real.
const CAT = {
  origenes: [
    { clave: 'VENTASDETALLE', nombre: 'Ventas', campos: [
      { clave: 'VENTASDETALLE.IMPORTE', nombre: 'IMPORTE', etiqueta: 'Importe', rol: 'METRICA' },
      { clave: 'VENTASDETALLE.CODARTICULO', nombre: 'CODARTICULO', etiqueta: 'Artículo', rol: 'DIMENSION' }
    ] },
    { clave: 'ARTICULOS', nombre: 'Artículos', campos: [
      { clave: 'ARTICULOS.DESCRIPCION', nombre: 'DESCRIPCION', etiqueta: 'Descripción', rol: 'DIMENSION' },
      { clave: 'ARTICULOS.FAMILIA', nombre: 'FAMILIA', etiqueta: 'Familia', rol: 'DIMENSION' }
    ] },
    { clave: 'CLIENTES', nombre: 'Clientes', campos: [
      { clave: 'CLIENTES.NOMBRECLIENTE', nombre: 'NOMBRECLIENTE', etiqueta: 'Nombre', rol: 'DIMENSION' }
    ] },
    { clave: 'PROVEEDORES', nombre: 'Proveedores', campos: [
      { clave: 'PROVEEDORES.NOMBRE', nombre: 'NOMBRE', etiqueta: 'Nombre', rol: 'DIMENSION' }
    ] }
  ],
  relaciones: [
    { izq: 'VENTASDETALLE', campoIzq: 'CODARTICULO', der: 'ARTICULOS', campoDer: 'CODARTICULO', cardinalidad: 'N1' },
    { izq: 'VENTASDETALLE', campoIzq: 'CODCLIENTE', der: 'CLIENTES', campoDer: 'CODCLIENTE', cardinalidad: 'N1' }
  ]
};

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};
const claves = (r) => r.campos.map(c => c.clave);

console.log('\nCampos alcanzables desde un origen');

test('sin origen elegido se ofrece el catálogo completo', () => {
  const r = camposAlcanzables(CAT, []);
  assert.strictEqual(r.campos.length, 6);
});

test('desde VENTASDETALLE se alcanzan artículos y clientes', () => {
  const r = camposAlcanzables(CAT, ['VENTASDETALLE']);
  assert.ok(r.origenes.includes('ARTICULOS'), 'debe alcanzar ARTICULOS');
  assert.ok(r.origenes.includes('CLIENTES'), 'debe alcanzar CLIENTES');
});

test('los campos relacionados quedan marcados', () => {
  const r = camposAlcanzables(CAT, ['VENTASDETALLE']);
  const desc = r.campos.find(c => c.clave === 'ARTICULOS.DESCRIPCION');
  assert.strictEqual(desc.viaRelacion, true);
  assert.strictEqual(desc.desde, 'VENTASDETALLE');
});

test('los campos propios NO se marcan como relacionados', () => {
  const r = camposAlcanzables(CAT, ['VENTASDETALLE']);
  const imp = r.campos.find(c => c.clave === 'VENTASDETALLE.IMPORTE');
  assert.strictEqual(imp.viaRelacion, false);
});

test('un origen sin relación no se cuela', () => {
  const r = camposAlcanzables(CAT, ['VENTASDETALLE']);
  assert.ok(!claves(r).some(c => c.startsWith('PROVEEDORES.')),
    'PROVEEDORES no está relacionado con ventas');
});

test('la relación funciona en sentido inverso', () => {
  // Partiendo de ARTICULOS también se debe llegar a VENTASDETALLE.
  const r = camposAlcanzables(CAT, ['ARTICULOS']);
  assert.ok(r.origenes.includes('VENTASDETALLE'));
});

test('con varios orígenes se acumulan sus alcances', () => {
  const r = camposAlcanzables(CAT, ['VENTASDETALLE', 'PROVEEDORES']);
  assert.ok(r.origenes.includes('PROVEEDORES'));
  assert.ok(r.origenes.includes('ARTICULOS'));
});

test('un origen ya elegido no se duplica como relacionado', () => {
  const r = camposAlcanzables(CAT, ['VENTASDETALLE', 'ARTICULOS']);
  const desc = r.campos.filter(c => c.clave === 'ARTICULOS.DESCRIPCION');
  assert.strictEqual(desc.length, 1);
  assert.strictEqual(desc[0].viaRelacion, false, 'si ya está elegido, es directo');
});

test('catálogo vacío no rompe', () => {
  assert.deepStrictEqual(camposAlcanzables(null, ['X']).campos, []);
  assert.deepStrictEqual(camposAlcanzables({}, []).campos, []);
});

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
