'use strict';
/**
 * Prueba de la administración del catálogo contra la BD real.
 * Verifica sobre todo las PROTECCIONES: solo SUPERVISOR, los orígenes del
 * paquete base no se tocan, y el SQL pasa la guarda de seguridad.
 *
 *   node test/catalogoAdmin.manual.js      (requiere el API corriendo)
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

async function entrar(usuario) {
  cookie = '';
  const pool = await new sql.ConnectionPool({
    server: process.env.GENERAL_DB_SERVER, database: process.env.GENERAL_DB_NAME,
    user: process.env.GENERAL_DB_USER, password: process.env.GENERAL_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }
  }).connect();
  const { recordset } = await pool.request()
    .input('u', sql.NVarChar(60), usuario)
    .query(`SELECT TOP 1 CODUSUARIO, NEWPASS FROM dbo.USUARIOS
            WHERE USUARIO = @u AND NEWPASS IS NOT NULL AND NEWPASS <> ''
              AND ISNULL(BLOQUEADO,'F') <> 'T' AND ISNULL(DESCATALOGADO,'F') <> 'T'`);
  await pool.close();
  if (!recordset[0]) return null;
  const r = await call('/api/login', { method: 'POST',
    body: JSON.stringify({ password: icgDecryptPass(recordset[0].NEWPASS) }) });
  if (r.status !== 200) return null;
  const emp = (await call('/api/empresas?area=GESTION')).j?.[0];
  if (emp) await call('/api/sesion/empresa', { method: 'POST',
    body: JSON.stringify({ codEmpresa: emp.codEmpresa }) });
  return { cod: recordset[0].CODUSUARIO, rol: r.j.rol };
}

(async () => {
  console.log('\n[1] Acceso restringido al SUPERVISOR (CODUSUARIO 0)');
  const sup = await entrar('SUPERVISOR');
  check(sup && sup.cod === 0, `SUPERVISOR entra (código ${sup?.cod})`);
  let r = await call('/api/catalogo/origenes');
  check(r.status === 200, 'SUPERVISOR ve los orígenes', `status ${r.status}`);
  const origenes = r.j || [];
  console.log(`    ${origenes.length} orígenes; base: ${origenes.filter(o => !o.EsPropio).length}`);

  // Otro usuario cualquiera no debe poder entrar al catálogo.
  const otro = await entrar('Consulta');
  if (otro) {
    r = await call('/api/catalogo/origenes');
    check(r.status === 403, `otro usuario (código ${otro.cod}) es rechazado`, `status ${r.status}`);
    console.log(`    -> ${r.j?.error}`);
  } else {
    console.log('    (no se pudo probar con otro usuario; se omite)');
  }
  await entrar('SUPERVISOR');

  console.log('\n[2] Los orígenes del catálogo base están protegidos');
  const base = origenes.find(o => !o.EsPropio);
  r = await call(`/api/catalogo/origenes/${base.OrigenId}`, { method: 'PUT',
    body: JSON.stringify({ nombre: 'intento', sqlBase: 'SELECT 1 AS X' }) });
  check(r.status === 409, `no se puede editar "${base.Clave}"`, `status ${r.status}`);
  console.log(`    -> ${r.j?.error}`);
  r = await call(`/api/catalogo/origenes/${base.OrigenId}`, { method: 'DELETE' });
  check(r.status === 409, 'no se puede eliminar un origen base', `status ${r.status}`);

  console.log('\n[3] Previsualizar SQL antes de guardar');
  r = await call('/api/catalogo/origenes/probar', { method: 'POST', body: JSON.stringify({
    sqlBase: 'SELECT p.CODPROVEEDOR, p.NOMPROVEEDOR FROM dbo.PROVEEDORES p WITH(NOLOCK)',
    area: 'GESTION' }) });
  check(r.status === 200, 'ejecuta y devuelve columnas', JSON.stringify(r.j).slice(0, 140));
  if (r.status === 200) {
    console.log(`    columnas: ${r.j.columnas.map(c => `${c.nombre}:${c.rol}`).join(', ')}`);
    console.log(`    muestra: ${r.j.muestra.length} filas`);
  }

  console.log('\n[4] El SQL del origen pasa la guarda de seguridad');
  r = await call('/api/catalogo/origenes/probar', { method: 'POST',
    body: JSON.stringify({ sqlBase: 'SELECT 1; DROP TABLE ARTICULOS' }) });
  check(r.status === 400, 'rechaza SQL con varias sentencias', `status ${r.status}`);
  r = await call('/api/catalogo/origenes', { method: 'POST', body: JSON.stringify({
    clave: 'MALICIOSO', nombre: 'x', tipo: 'HECHOS',
    sqlBase: 'DELETE FROM ARTICULOS', campos: [] }) });
  check(r.status === 400, 'rechaza guardar un origen con DELETE', `status ${r.status}`);

  console.log('\n[5] Crear un origen propio');
  r = await call('/api/catalogo/origenes', { method: 'POST', body: JSON.stringify({
    clave: 'PROVEEDORES_TEST', nombre: 'Proveedores (prueba)', tipo: 'DIMENSION', area: 'GESTION',
    sqlBase: 'SELECT p.CODPROVEEDOR, p.NOMPROVEEDOR FROM dbo.PROVEEDORES p WITH(NOLOCK)',
    campos: [
      { clave: 'CODPROVEEDOR', etiqueta: 'Código', expresion: 'CODPROVEEDOR', rol: 'DIMENSION', tipoDato: 'INT', formato: 'ENTERO' },
      { clave: 'NOMBRE', etiqueta: 'Nombre', expresion: 'NOMPROVEEDOR', rol: 'DIMENSION', tipoDato: 'STRING', formato: 'TEXTO' }
    ] }) });
  const propioId = r.j?.OrigenId;
  check(r.status === 201, `origen propio creado (id ${propioId})`, JSON.stringify(r.j).slice(0, 140));

  console.log('\n[6] El origen propio ya se puede consultar como cualquier otro');
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['PROVEEDORES_TEST.NOMBRE'], metricas: [], limite: 5 } }) });
  check(r.status === 200 && (r.j?.rows?.length ?? 0) > 0,
    `devuelve datos reales (${r.j?.rows?.length} filas)`, JSON.stringify(r.j).slice(0, 140));

  console.log('\n[7] Duplicar un origen base para personalizarlo');
  r = await call(`/api/catalogo/origenes/${base.OrigenId}/duplicar`, { method: 'POST',
    body: JSON.stringify({ clave: 'VENTAS_TEST_COPIA', nombre: 'Copia de prueba' }) });
  const copiaId = r.j?.OrigenId;
  check(r.status === 201, `duplicado creado (id ${copiaId})`, JSON.stringify(r.j).slice(0, 140));
  if (copiaId) {
    const det = await call(`/api/catalogo/origenes/${copiaId}`);
    check(det.j?.esPropio === true, 'la copia nace como origen propio (editable)');
    check((det.j?.campos?.length ?? 0) > 0, `copia sus ${det.j?.campos?.length} campos`);
    const upd = await call(`/api/catalogo/origenes/${copiaId}`, { method: 'PUT',
      body: JSON.stringify({ nombre: 'Copia editada', tipo: det.j.origen.Tipo, area: 'GESTION' }) });
    check(upd.status === 200, 'y sí se puede editar');
  }

  console.log('\n[7b] Relacionar un origen propio con uno base');
  // Se crea un origen propio con el código de artículo para poder relacionarlo.
  r = await call('/api/catalogo/origenes', { method: 'POST', body: JSON.stringify({
    clave: 'REL_TEST', nombre: 'Relación (prueba)', tipo: 'HECHOS', area: 'GESTION',
    sqlBase: 'SELECT s.CODARTICULO, s.STOCK FROM dbo.STOCKS s WITH(NOLOCK)',
    campos: [
      { clave: 'CODARTICULO', etiqueta: 'Artículo', expresion: 'CODARTICULO', rol: 'DIMENSION', tipoDato: 'INT', formato: 'ENTERO' },
      { clave: 'EXISTENCIAS', etiqueta: 'Existencias', expresion: 'STOCK', rol: 'METRICA', tipoDato: 'DECIMAL', agregacion: 'SUMA', formato: 'NUMERO' }
    ] }) });
  const relId = r.j?.OrigenId;
  check(r.status === 201, `origen para relación creado (id ${relId})`);

  r = await call('/api/catalogo/relaciones', { method: 'POST', body: JSON.stringify({
    origenIzq: 'REL_TEST', campoIzq: 'CODARTICULO',
    origenDer: 'ARTICULOS', campoDer: 'CODARTICULO', cardinalidad: 'N1' }) });
  check(r.status === 201, 'relación propio → base creada', JSON.stringify(r.j).slice(0, 120));

  // Ya se puede enriquecer el origen propio con una dimensión del catálogo base.
  r = await call('/api/dashboards/consultar', { method: 'POST', body: JSON.stringify({
    consulta: { dimensiones: ['ARTICULOS.DPTO'], metricas: ['REL_TEST.EXISTENCIAS'], limite: 20 } }) });
  check(r.status === 200 && (r.j?.rows?.length ?? 0) > 0,
    `la relación funciona: existencias por departamento (${r.j?.rows?.length} filas)`,
    JSON.stringify(r.j).slice(0, 130));

  // Entre dos orígenes base no se permite añadir relaciones.
  r = await call('/api/catalogo/relaciones', { method: 'POST', body: JSON.stringify({
    origenIzq: 'ARTICULOS', campoIzq: 'CODARTICULO',
    origenDer: 'CLIENTES', campoDer: 'CODCLIENTE', cardinalidad: 'N1' }) });
  check(r.status === 409, 'no se relacionan dos orígenes base entre sí', `status ${r.status}`);

  console.log('\n[8] Limpieza');
  if (relId) {
    const d = await call(`/api/catalogo/origenes/${relId}`, { method: 'DELETE' });
    console.log(`    origen ${relId} eliminado: status ${d.status}`);
  }
  for (const id of [propioId, copiaId].filter(Boolean)) {
    const d = await call(`/api/catalogo/origenes/${id}`, { method: 'DELETE' });
    console.log(`    origen ${id} eliminado: status ${d.status}`);
  }

  console.log(`\n${ok} comprobaciones OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
