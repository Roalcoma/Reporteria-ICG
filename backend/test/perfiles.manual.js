'use strict';
/**
 * Prueba manual de carpetas, duplicado de reportes y perfiles contra la BD real.
 * Requiere el API corriendo.   node test/perfiles.manual.js
 */
require('dotenv').config();
const sql = require('mssql');
const { icgDecryptPass } = require('../src/services/icgPassword');

const BASE = `http://localhost:${process.env.PORT || 3010}`;
let cookie = '';

async function call(ruta, opciones = {}) {
  const res = await fetch(BASE + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opciones.headers || {}) }
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let j = null;
  try { j = JSON.parse(await res.text()); } catch { /* respuesta vacia */ }
  return { status: res.status, j };
}

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
  const emp = (await call('/api/empresas?area=GESTION')).j[0];
  await call('/api/sesion/empresa', { method: 'POST',
    body: JSON.stringify({ codEmpresa: emp.codEmpresa }) });

  console.log('\n[1] Crear carpeta');
  let r = await call('/api/carpetas', { method: 'POST',
    body: JSON.stringify({ Nombre: 'Carpeta Prueba' }) });
  const carpetaId = r.j?.CarpetaId;
  console.log(`  status ${r.status} | CarpetaId ${carpetaId}`);

  console.log('[2] Crear reporte dentro de la carpeta');
  r = await call('/api/reportes', { method: 'POST', body: JSON.stringify({
    reporte: { Nombre: 'RP Base', Tipo: 'DASHBOARD', Area: 'GESTION', CarpetaId: carpetaId },
    consultas: [{ Rol: 'BASE', SqlText: 'SELECT TOP 5 CODARTICULO, DPTO FROM ARTICULOS' }],
    parametros: [], columnas: [] }) });
  const repId = r.j?.ReporteId;
  console.log(`  status ${r.status} | ReporteId ${repId}`);

  console.log('[3] Duplicar reporte');
  r = await call(`/api/reportes/${repId}/duplicar`, { method: 'POST',
    body: JSON.stringify({ nombre: 'RP Base (copia)' }) });
  const dupId = r.j?.ReporteId;
  console.log(`  status ${r.status} | "${r.j?.Nombre}"`);
  const full = await call(`/api/reportes/${dupId}`);
  console.log(`  la copia conserva la consulta: ${full.j?.consultas?.[0]?.SqlText?.slice(0, 45)}`);
  console.log(`  y la carpeta: ${full.j?.reporte?.CarpetaId === carpetaId ? 'si' : 'no'}`);

  console.log('[4] Borrar carpeta con contenido (debe negarse)');
  r = await call(`/api/carpetas/${carpetaId}`, { method: 'DELETE' });
  console.log(`  status ${r.status} (se espera 409) -> ${r.j?.error}`);

  console.log('[5] Perfiles: crear y asociar reportes');
  r = await call('/api/perfiles', { method: 'POST',
    body: JSON.stringify({ nombre: 'Contable Prueba', descripcion: 'perfil de prueba' }) });
  const perfilId = r.j?.PerfilId;
  console.log(`  perfil creado: ${perfilId}`);
  r = await call(`/api/perfiles/${perfilId}/reportes`, { method: 'PUT',
    body: JSON.stringify({ reporteIds: [repId] }) });
  console.log(`  asociar reportes status ${r.status}`);

  console.log('[6] Asignar el perfil a un usuario');
  const cod = recordset[0].CODUSUARIO;
  r = await call(`/api/perfiles/usuario/${cod}`, { method: 'PUT',
    body: JSON.stringify({ perfilIds: [perfilId], login: 'SUPERVISOR' }) });
  console.log(`  asignar status ${r.status}`);
  r = await call(`/api/perfiles/${perfilId}`);
  console.log(`  el perfil tiene ${r.j?.reportes?.length} reporte(s) y ${r.j?.usuarios?.length} usuario(s)`);
  r = await call('/api/perfiles');
  const p = r.j?.find(x => x.PerfilId === perfilId);
  console.log(`  resumen en la lista: Reportes=${p?.Reportes} Usuarios=${p?.Usuarios}`);
  r = await call('/api/reportes');
  console.log(`  reportes visibles para un administrador (ve todos): ${r.j?.length}`);

  console.log('[7] Limpieza');
  await call(`/api/perfiles/usuario/${cod}`, { method: 'PUT', body: JSON.stringify({ perfilIds: [] }) });
  await call(`/api/perfiles/${perfilId}`, { method: 'DELETE' });
  await call(`/api/reportes/${repId}`, { method: 'DELETE' });
  await call(`/api/reportes/${dupId}`, { method: 'DELETE' });
  r = await call(`/api/carpetas/${carpetaId}`, { method: 'DELETE' });
  console.log(`  carpeta ya vacia eliminada: status ${r.status}`);

  console.log('\n=== PRUEBA COMPLETADA ===\n');
  process.exit(0);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
