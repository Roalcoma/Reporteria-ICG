'use strict';
/**
 * Prueba del motor semántico contra datos reales.
 * Lo esencial: comprobar que combinar dos orígenes de hechos NO infla los
 * importes (el fan-out clásico de unir ventas con existencias).
 *
 *   node test/semantico.manual.js      (requiere el API corriendo)
 */
require('dotenv').config();
const sql = require('mssql');
const { icgDecryptPass } = require('../src/services/icgPassword');

const BASE = `http://localhost:${process.env.PORT || 3010}`;
let cookie = '';
let ok = 0, fallos = 0;

const check = (cond, nombre, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.error(`  ✗ ${nombre} ${detalle}`); }
};

async function call(ruta, opciones = {}) {
  const res = await fetch(BASE + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opciones.headers || {}) }
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let j = null;
  try { j = JSON.parse(await res.text()); } catch { /* vacio */ }
  return { status: res.status, j };
}
const consultar = (consulta) => call('/api/dashboards/consultar', {
  method: 'POST', body: JSON.stringify({ consulta })
});

(async () => {
  const pool = await new sql.ConnectionPool({
    server: process.env.GENERAL_DB_SERVER, database: process.env.GENERAL_DB_NAME,
    user: process.env.GENERAL_DB_USER, password: process.env.GENERAL_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }
  }).connect();
  const { recordset } = await pool.request().query(
    "SELECT TOP 1 CODUSUARIO, NEWPASS FROM dbo.USUARIOS WHERE USUARIO = 'SUPERVISOR'");
  await pool.close();

  await call('/api/login', { method: 'POST',
    body: JSON.stringify({ password: icgDecryptPass(recordset[0].NEWPASS) }) });
  const emp = (await call('/api/empresas?area=GESTION')).j.find(e => e.codEmpresa === 1)
           || (await call('/api/empresas?area=GESTION')).j[0];
  await call('/api/sesion/empresa', { method: 'POST',
    body: JSON.stringify({ codEmpresa: emp.codEmpresa }) });
  console.log(`\nEmpresa de prueba: [${emp.codEmpresa}] ${emp.nombre}`);

  console.log('\n[1] Catálogo publicado');
  let r = await call('/api/dashboards/catalogo');
  const cat = r.j;
  check(r.status === 200 && cat.origenes.length > 0,
    `${cat?.origenes?.length} orígenes disponibles`);
  console.log(`    ${cat.origenes.map(o => `${o.clave}(${o.campos.length})`).join(', ')}`);

  console.log('\n[2] Consulta de un solo origen: ventas por almacén');
  // Sin recortar: hay almacenes con importe NEGATIVO (devoluciones) y un TOP
  // por importe descendente los dejaría fuera, falseando la comparación.
  r = await consultar({
    dimensiones: ['VENTASDETALLE.CODALMACEN'],
    metricas: ['VENTASDETALLE.IMPORTE', 'VENTASDETALLE.UNIDADES'],
    orden: { campo: 'VENTASDETALLE.IMPORTE', direccion: 'DESC' }, limite: 5000
  });
  check(r.status === 200, 'la consulta se ejecuta', JSON.stringify(r.j).slice(0, 160));
  const porAlmacen = r.j?.rows || [];
  console.log(`    ${porAlmacen.length} filas; primera: ${JSON.stringify(porAlmacen[0])}`);
  const totalVentas = porAlmacen.reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);

  console.log('\n[3] Enriquecer con una dimensión (artículos, relación N:1)');
  r = await consultar({
    dimensiones: ['ARTICULOS.DPTO'],
    metricas: ['VENTASDETALLE.IMPORTE'],
    orden: { campo: 'VENTASDETALLE.IMPORTE', direccion: 'DESC' }, limite: 100
  });
  check(r.status === 200, 'ventas por departamento de artículo', JSON.stringify(r.j).slice(0, 160));
  const porDpto = r.j?.rows || [];
  const totalDpto = porDpto.reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);
  console.log(`    ${porDpto.length} departamentos, total ${totalDpto.toFixed(2)}`);
  // Unir con una dimensión N:1 no puede cambiar el importe total.
  check(Math.abs(totalDpto - totalVentas) < 0.5,
    'el total NO cambia al unir con una dimensión',
    `(por almacén ${totalVentas.toFixed(2)} vs por depto ${totalDpto.toFixed(2)})`);

  console.log('\n[4] PRUEBA CLAVE: combinar ventas + existencias sin inflar importes');
  // Se compara la MISMA dimensión y el MISMO límite con y sin la métrica de
  // existencias: así un recorte por TOP afecta igual a ambas y la única
  // diferencia posible sería la duplicación de importes (fan-out).
  const LIM = 20000;
  const base = await consultar({
    dimensiones: ['VENTASDETALLE.CODARTICULO'],
    metricas: ['VENTASDETALLE.IMPORTE'],
    orden: { campo: 'VENTASDETALLE.IMPORTE', direccion: 'DESC' }, limite: LIM
  });
  const totalPorArticulo = (base.j?.rows || [])
    .reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);

  r = await consultar({
    dimensiones: ['VENTASDETALLE.CODARTICULO'],
    metricas: ['VENTASDETALLE.IMPORTE', 'STOCKS.STOCK'],
    orden: { campo: 'VENTASDETALLE.IMPORTE', direccion: 'DESC' }, limite: LIM
  });
  check(r.status === 200, 'la consulta combinada se ejecuta', JSON.stringify(r.j).slice(0, 200));
  const combinada = r.j?.rows || [];
  const totalCombinado = combinada.reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);
  console.log(`    ${combinada.length} artículos; ejemplo: ${JSON.stringify(combinada[0])}`);
  console.log(`    solo ventas ${totalPorArticulo.toFixed(2)} | con existencias ${totalCombinado.toFixed(2)}`);
  check(Math.abs(totalCombinado - totalPorArticulo) < 0.5,
    'el importe de ventas NO se infla al añadir existencias',
    `(diferencia ${(totalCombinado - totalPorArticulo).toFixed(2)})`);
  check(combinada.some(f => f.STOCKS_STOCK != null), 'trae existencias reales de STOCKS');
  check(r.j?.columnas?.length === 3, 'devuelve las 3 columnas seleccionadas');

  console.log('\n[4b] Conversión de moneda: el importe va en moneda principal');
  // En ICG los importes están en la moneda del documento; hay que multiplicar
  // por FACTORMONEDA para llevarlos a la principal. Se comprueba contra el
  // valor calculado directamente en la base de datos.
  const pool2 = await new sql.ConnectionPool({
    server: process.env.GENERAL_DB_SERVER, database: 'CLARKS2025',
    user: process.env.DATA_DB_DEFAULT_USER, password: process.env.DATA_DB_DEFAULT_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }
  }).connect();
  const esperado = await pool2.request().query(`
    SELECT SUM(l.TOTAL * c.FACTORMONEDA) AS conFactor, SUM(l.TOTAL) AS sinFactor
    FROM dbo.ALBVENTALIN l
    JOIN dbo.ALBVENTACAB c ON c.NUMSERIE=l.NUMSERIE AND c.NUMALBARAN=l.NUMALBARAN AND c.N=l.N
    WHERE ISNULL(l.LINEAOCULTA,'F') <> 'T'`);
  await pool2.close();
  const { conFactor, sinFactor } = esperado.recordset[0];
  console.log(`    en la base: con factor ${conFactor.toFixed(2)} | sin factor ${sinFactor.toFixed(2)}`);
  console.log(`    el catálogo devuelve ${totalPorArticulo.toFixed(2)}`);
  check(Math.abs(totalPorArticulo - conFactor) < 1,
    'IMPORTE aplica el factor de moneda',
    `(catálogo ${totalPorArticulo.toFixed(2)} vs esperado ${conFactor.toFixed(2)})`);
  check(Math.abs(totalPorArticulo - sinFactor) > 1,
    'y NO devuelve el importe sin convertir');

  // El importe en moneda del documento sigue disponible aparte.
  r = await consultar({
    dimensiones: ['VENTASDETALLE.CODMONEDA'],
    metricas: ['VENTASDETALLE.IMPORTE', 'VENTASDETALLE.IMPORTE_DOC'], limite: 50
  });
  const porMoneda = r.j?.rows || [];
  const sumDoc = porMoneda.reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE_DOC || 0), 0);
  console.log(`    ${porMoneda.length} monedas en uso`);
  check(r.status === 200 && porMoneda.length > 1, 'se puede desglosar por moneda');
  check(Math.abs(sumDoc - sinFactor) < 1,
    'IMPORTE_DOC conserva el valor del documento',
    `(${sumDoc.toFixed(2)} vs ${sinFactor.toFixed(2)})`);

  console.log('\n[5] Filtros con valores enlazados');
  r = await consultar({
    dimensiones: ['VENTASDETALLE.CODALMACEN'],
    metricas: ['VENTASDETALLE.IMPORTE'],
    filtros: [{ campo: 'VENTASDETALLE.UNIDADES', operador: 'MAYOR', valor: 0 }],
    limite: 10
  });
  check(r.status === 200, 'filtro numérico aplicado', JSON.stringify(r.j).slice(0, 160));

  console.log('\n[6] Seguridad: solo se admiten campos del catálogo');
  r = await consultar({ dimensiones: ['VENTASDETALLE.NO_EXISTE'], metricas: [] });
  check(r.status === 400, 'campo inexistente rechazado', `-> ${r.j?.error}`);
  r = await consultar({ dimensiones: ['ALBVENTALIN.TOTAL'], metricas: [] });
  check(r.status === 400, 'no se puede referenciar una tabla física', `-> ${r.j?.error}`);
  r = await consultar({ dimensiones: ['VENTASDETALLE.IMPORTE'], metricas: [] });
  check(r.status === 400, 'una métrica no sirve como dimensión', `-> ${r.j?.error}`);

  console.log('\n[7] Guardar, compartir y borrar un dashboard');
  r = await call('/api/dashboards', { method: 'POST', body: JSON.stringify({
    nombre: 'Dashboard de prueba', descripcion: 'e2e', area: 'GESTION',
    configuracion: { widgets: [{ tipo: 'bar',
      consulta: { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'] } }] }
  }) });
  const dashId = r.j?.DashboardId;
  check(r.status === 201, `dashboard creado (id ${dashId})`);
  r = await call(`/api/dashboards/${dashId}`);
  check(r.status === 200 && r.j?.dashboard?.configuracion?.widgets?.length === 1,
    'se recupera con su configuración');
  check(r.j?.puedeEditar === true, 'el autor puede editarlo');
  r = await call('/api/dashboards');
  check((r.j || []).some(d => d.DashboardId === dashId), 'aparece en la lista de visibles');
  r = await call(`/api/dashboards/${dashId}`, { method: 'DELETE' });
  check(r.status === 200, 'eliminado');

  console.log(`\n${ok} comprobaciones OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
