'use strict';
/**
 * Verifica el flujo del constructor de dashboards de extremo a extremo,
 * usando la MISMA forma de configuración que genera la interfaz.
 *
 *   node test/dashboardUI.manual.js       (requiere el API corriendo)
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

/** Atajo para lanzar una consulta semántica. */
const consultar = (consulta) =>
  call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({ consulta }) });

/** Configuración tal cual la arma WidgetEditor. */
const widget = (id, titulo, tipo, consulta, ancho = 'medio') =>
  ({ id, titulo, tipo, ancho, consulta });

(async () => {
  const pool = await new sql.ConnectionPool({
    server: process.env.GENERAL_DB_SERVER, database: process.env.GENERAL_DB_NAME,
    user: process.env.GENERAL_DB_USER, password: process.env.GENERAL_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }
  }).connect();
  const { recordset } = await pool.request().query(
    "SELECT TOP 1 NEWPASS FROM dbo.USUARIOS WHERE USUARIO = 'SUPERVISOR'");
  await pool.close();
  await call('/api/login', { method: 'POST',
    body: JSON.stringify({ password: icgDecryptPass(recordset[0].NEWPASS) }) });
  const emp = (await call('/api/empresas?area=GESTION')).j[0];
  await call('/api/sesion/empresa', { method: 'POST',
    body: JSON.stringify({ codEmpresa: emp.codEmpresa }) });

  console.log('\n[1] El catálogo llega en la forma que espera el constructor');
  let r = await call('/api/dashboards/catalogo');
  const cat = r.j;
  const campos = (cat?.origenes || []).flatMap(o => o.campos);
  check(r.status === 200 && campos.length > 0, `${campos.length} campos seleccionables`);
  check(campos.every(c => c.clave && c.etiqueta && c.rol),
    'cada campo trae clave, etiqueta y rol');
  const dims = campos.filter(c => c.rol === 'DIMENSION');
  const mets = campos.filter(c => c.rol === 'METRICA');
  console.log(`    ${dims.length} dimensiones · ${mets.length} métricas`);
  check(dims.length > 0 && mets.length > 0, 'hay dimensiones y métricas para elegir');

  console.log('\n[2] Cada tipo de widget devuelve datos utilizables');
  const casos = [
    ['bar',   { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'], limite: 20 }],
    ['line',  { dimensiones: ['VENTASCABECERA.FECHA'], metricas: ['VENTASCABECERA.TOTALNETO'], limite: 30 }],
    ['pie',   { dimensiones: ['VENTASDETALLE.CODALMACEN'], metricas: ['VENTASDETALLE.IMPORTE'], limite: 10 }],
    ['tabla', { dimensiones: ['ARTICULOS.DESCRIPCION'], metricas: ['VENTASDETALLE.UNIDADES'], limite: 15 }],
    ['kpi',   { dimensiones: [], metricas: ['VENTASCABECERA.TOTALNETO', 'VENTASCABECERA.DOCUMENTOS'] }]
  ];
  for (const [tipo, consulta] of casos) {
    const res = await call('/api/dashboards/consultar', { method: 'POST',
      body: JSON.stringify({ consulta }) });
    const filas = res.j?.rows?.length ?? 0;
    check(res.status === 200 && filas > 0, `${tipo}: ${filas} filas`,
      JSON.stringify(res.j).slice(0, 130));
  }

  console.log('\n[3] Un widget que combina dos orígenes');
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['VENTASDETALLE.CODARTICULO'],
      metricas: ['VENTASDETALLE.IMPORTE', 'STOCKS.STOCK'], limite: 20,
      orden: { campo: 'VENTASDETALLE.IMPORTE', direccion: 'DESC' } } }) });
  check(r.status === 200 && r.j.columnas.length === 3,
    'ventas y existencias en el mismo gráfico', JSON.stringify(r.j).slice(0, 130));

  console.log('\n[4] Filtros tal como los envía la interfaz');
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['VENTASDETALLE.CODALMACEN'], metricas: ['VENTASDETALLE.IMPORTE'],
      filtros: [{ campo: 'VENTASDETALLE.UNIDADES', operador: 'MAYOR', valor: '0' }], limite: 20 } }) });
  check(r.status === 200, 'filtro numérico', JSON.stringify(r.j).slice(0, 130));
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'],
      filtros: [{ campo: 'VENTASCABECERA.FECHA', operador: 'ENTRE',
                  desde: '2020-01-01', hasta: '2030-12-31' }], limite: 20 } }) });
  check(r.status === 200, 'filtro de fechas ENTRE', JSON.stringify(r.j).slice(0, 130));

  console.log('\n[4b] Interacción del panel: filtros (slicer) y clic cruzado');
  // Un filtro del panel envía operador EN con varios valores.
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'],
      filtros: [{ campo: 'VENTASDETALLE.CODALMACEN', operador: 'EN', valor: ['ZZA', 'ZZV'] }],
      limite: 20 } }) });
  check(r.status === 200, 'filtro del panel con varios valores (EN)',
    JSON.stringify(r.j).slice(0, 130));
  const conFiltro = (r.j?.rows || []).reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);

  // Sin el filtro debe salir más importe: comprueba que el filtro actúa de verdad.
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'], limite: 20 } }) });
  const sinFiltro = (r.j?.rows || []).reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);
  check(conFiltro > 0 && conFiltro < sinFiltro,
    'el filtro reduce el resultado de verdad',
    `(con ${conFiltro.toFixed(0)} vs sin ${sinFiltro.toFixed(0)})`);

  // El clic sobre una barra manda un IGUAL sobre la dimensión pulsada.
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['VENTASDETALLE.CODALMACEN'], metricas: ['VENTASDETALLE.IMPORTE'],
      filtros: [{ campo: 'ARTICULOS.DPTO', operador: 'IGUAL', valor: '2' }], limite: 20 } }) });
  check(r.status === 200, 'clic cruzado: filtra por un campo relacionado',
    JSON.stringify(r.j).slice(0, 130));

  console.log('\n[4c] Campos alcanzables por relación');
  // Métrica de VENTASDETALLE agrupada por un campo de ARTICULOS: es lo que
  // permite el selector cuando muestra los campos «🔗 relacionados».
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['ARTICULOS.DESCRIPCION'], metricas: ['VENTASDETALLE.UNIDADES'],
      orden: { campo: 'VENTASDETALLE.UNIDADES', direccion: 'DESC' }, limite: 5 } }) });
  check(r.status === 200 && (r.j?.rows?.length ?? 0) > 0,
    'unidades por descripción de artículo (vía relación)',
    JSON.stringify(r.j).slice(0, 130));
  if (r.j?.rows?.[0]) {
    console.log(`    más vendido: ${JSON.stringify(r.j.rows[0])}`);
  }

  console.log('\n[4d] Dimensión de fecha');
  for (const [campo, etiqueta] of [
    ['VENTASDETALLE.ANIO', 'año'], ['VENTASDETALLE.TRIMESTRE', 'trimestre'],
    ['VENTASDETALLE.ANIO_MES', 'año-mes'], ['VENTASDETALLE.SEMANA', 'semana'],
    ['VENTASDETALLE.SEMESTRE', 'semestre'], ['VENTASDETALLE.CUATRIMESTRE', 'cuatrimestre']
  ]) {
    const res = await consultar({ dimensiones: [campo], metricas: ['VENTASDETALLE.IMPORTE'],
      orden: { campo, direccion: 'ASC' }, limite: 60 });
    check(res.status === 200 && (res.j?.rows?.length ?? 0) > 0,
      `agrupar por ${etiqueta} (${res.j?.rows?.length} valores)`,
      JSON.stringify(res.j).slice(0, 110));
  }

  // El calendario conformado se relaciona por fecha con las ventas.
  r = await consultar({ dimensiones: ['CALENDARIO.ANIO_MES'],
    metricas: ['VENTASDETALLE.IMPORTE'], orden: { campo: 'CALENDARIO.ANIO_MES', direccion: 'ASC' },
    limite: 40 });
  check(r.status === 200 && (r.j?.rows?.length ?? 0) > 0,
    `evolución mensual vía CALENDARIO (${r.j?.rows?.length} meses)`,
    JSON.stringify(r.j).slice(0, 130));

  console.log('\n[4e] Filtros por periodo relativo');
  const totalSinFecha = (await consultar({ dimensiones: ['VENTASDETALLE.ANIO'],
    metricas: ['VENTASDETALLE.IMPORTE'], limite: 20 })).j?.rows || [];
  const sumaTotal = totalSinFecha.reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);

  for (const periodo of ['ANIO_ACTUAL', 'ULTIMOS_365', 'MES_ACTUAL', 'ANIO_ANTERIOR']) {
    const res = await consultar({ dimensiones: ['VENTASDETALLE.ANIO_MES'],
      metricas: ['VENTASDETALLE.IMPORTE'],
      filtros: [{ campo: 'VENTASDETALLE.FECHA', operador: 'PERIODO', valor: periodo }],
      limite: 40 });
    const suma = (res.j?.rows || []).reduce((a, f) => a + Number(f.VENTASDETALLE_IMPORTE || 0), 0);
    check(res.status === 200,
      `periodo ${periodo}: ${res.j?.rows?.length ?? 0} meses, ${suma.toFixed(0)}`,
      JSON.stringify(res.j).slice(0, 110));
    if (res.status === 200 && suma > sumaTotal + 1) {
      check(false, `${periodo} no debería superar el total sin filtrar`);
    }
  }

  r = await consultar({ dimensiones: ['VENTASDETALLE.ANIO'], metricas: ['VENTASDETALLE.IMPORTE'],
    filtros: [{ campo: 'VENTASDETALLE.FECHA', operador: 'PERIODO', valor: 'NO_EXISTE' }] });
  check(r.status === 400, 'un periodo desconocido se rechaza con mensaje claro',
    `-> ${r.j?.error}`);

  console.log('\n[5] Guardar un dashboard con varios widgets');
  const configuracion = { widgets: [
    widget('w1', 'Ventas por departamento', 'bar',
      { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'], limite: 20 }),
    widget('w2', 'Totales', 'kpi',
      { dimensiones: [], metricas: ['VENTASCABECERA.TOTALNETO', 'VENTASCABECERA.DOCUMENTOS'] }),
    widget('w3', 'Ventas vs existencias', 'tabla',
      { dimensiones: ['VENTASDETALLE.CODARTICULO'],
        metricas: ['VENTASDETALLE.IMPORTE', 'STOCKS.STOCK'], limite: 25 }, 'completo')
  ] };
  r = await call('/api/dashboards', { method: 'POST', body: JSON.stringify({
    nombre: 'Panel comercial (prueba)', descripcion: 'generado por la prueba',
    area: 'GESTION', configuracion }) });
  const id = r.j?.DashboardId;
  check(r.status === 201, `dashboard guardado (id ${id})`);

  r = await call(`/api/dashboards/${id}`);
  const w = r.j?.dashboard?.configuracion?.widgets || [];
  check(w.length === 3, 'conserva sus 3 widgets');
  check(w[0].consulta.metricas[0] === 'VENTASDETALLE.IMPORTE',
    'las referencias son claves lógicas del catálogo, no SQL');
  check(w[2].ancho === 'completo', 'conserva la disposición de cada widget');

  console.log('\n[6] Compatibilidad: los widgets se resuelven contra el catálogo actual');
  let todosOk = true;
  for (const wi of w) {
    const res = await call('/api/dashboards/consultar', { method: 'POST',
      body: JSON.stringify({ consulta: wi.consulta }) });
    if (res.status !== 200) { todosOk = false; console.error(`    ${wi.titulo}: ${res.j?.error}`); }
  }
  check(todosOk, 'los 3 widgets del dashboard guardado se ejecutan');

  console.log('\n[6b] Panel con pestañas, tamaños y alcance de filtros');
  const cfgTabs = {
    tabs: [{ id: 't1', nombre: 'Comercial' }, { id: 't2', nombre: 'Existencias' }],
    filtros: [{ id: 'f1', tabId: 't1', campo: 'VENTASDETALLE.CODALMACEN',
                titulo: 'Almacén', ancho: 'tercio', afecta: 'TODOS' }],
    widgets: [
      widget('w1', 'Ventas por departamento', 'bar',
        { dimensiones: ['ARTICULOS.DPTO'], metricas: ['VENTASDETALLE.IMPORTE'], limite: 20 }),
      widget('w2', 'Total fijo', 'kpi',
        { dimensiones: [], metricas: ['VENTASCABECERA.TOTALNETO'] }),
      widget('w3', 'Existencias', 'tabla',
        { dimensiones: ['ARTICULOS.DESCRIPCION'], metricas: ['STOCKS.STOCK'], limite: 10 })
    ]
  };
  // Reparto por pestaña y opciones de interacción.
  cfgTabs.widgets[0] = { ...cfgTabs.widgets[0], tabId: 't1', ancho: 'dosTercios', alto: 'alto', emite: true, recibe: true };
  cfgTabs.widgets[1] = { ...cfgTabs.widgets[1], tabId: 't1', ancho: 'tercio', recibe: false };
  cfgTabs.widgets[2] = { ...cfgTabs.widgets[2], tabId: 't2', ancho: 'completo' };

  r = await call('/api/dashboards', { method: 'POST', body: JSON.stringify({
    nombre: 'Panel con pestañas (prueba)', area: 'GESTION', configuracion: cfgTabs }) });
  const idTabs = r.j?.DashboardId;
  check(r.status === 201, `panel con pestañas guardado (id ${idTabs})`);

  r = await call(`/api/dashboards/${idTabs}`);
  const c = r.j?.dashboard?.configuracion;
  check(c?.tabs?.length === 2, 'conserva las 2 pestañas');
  check(c?.widgets.filter(w => w.tabId === 't1').length === 2, 'reparte los objetos por pestaña');
  check(c?.widgets.find(w => w.id === 'w1')?.ancho === 'dosTercios', 'conserva el ancho');
  check(c?.widgets.find(w => w.id === 'w1')?.alto === 'alto', 'conserva el alto');
  check(c?.widgets.find(w => w.id === 'w2')?.recibe === false,
    'conserva el objeto marcado como fijo');
  check(c?.filtros?.[0]?.afecta === 'TODOS', 'conserva el alcance del filtro');
  await call(`/api/dashboards/${idTabs}`, { method: 'DELETE' });

  console.log('\n[7] Un campo retirado del catálogo avisa en vez de romper');
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['VENTASDETALLE.CAMPO_QUE_NO_EXISTE'], metricas: [] } }) });
  check(r.status === 400 && /no existe/i.test(r.j?.error || ''),
    'mensaje claro para un campo inexistente', `-> ${r.j?.error}`);

  console.log('\n[8] Limpieza');
  r = await call(`/api/dashboards/${id}`, { method: 'DELETE' });
  console.log(`    eliminado: status ${r.status}`);

  console.log(`\n${ok} comprobaciones OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
