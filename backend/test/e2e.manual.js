'use strict';
/**
 * Prueba END-TO-END contra un SQL Server real.
 *
 * NO forma parte de `npm test`: requiere la BD de configuracion creada, el .env
 * configurado y el API corriendo (`npm start`).
 *
 *   node test/e2e.manual.js
 *
 * Toma la clave de un usuario de ICG, la descifra en memoria y la usa para
 * iniciar sesion. NUNCA imprime la contrasena.
 */
require('dotenv').config();
const sql = require('mssql');
const { icgDecryptPass } = require('../src/services/icgPassword');

const BASE = `http://localhost:${process.env.PORT || 3010}`;
const USUARIO_PRUEBA = process.argv[2] || 'SUPERVISOR';
let cookie = '';

async function api(ruta, opciones = {}) {
  const res = await fetch(BASE + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opciones.headers || {}) }
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const cuerpo = await res.json().catch(() => null);
  return { status: res.status, cuerpo };
}

const conectarGeneral = () => new sql.ConnectionPool({
  server: process.env.GENERAL_DB_SERVER,
  database: process.env.GENERAL_DB_NAME,
  user: process.env.GENERAL_DB_USER,
  password: process.env.GENERAL_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true }
}).connect();

(async () => {
  const paso = (n, t) => console.log(`\n[${n}] ${t}`);

  // --- Clave real de ICG (no se imprime) ---
  const pool = await conectarGeneral();
  const { recordset } = await pool.request()
    .input('u', sql.NVarChar(60), USUARIO_PRUEBA)
    .query(`SELECT TOP 1 CODUSUARIO, USUARIO, NEWPASS FROM dbo.USUARIOS
            WHERE USUARIO = @u AND NEWPASS IS NOT NULL AND NEWPASS <> ''`);
  await pool.close();
  if (!recordset[0]) { console.error(`No se hallo el usuario ${USUARIO_PRUEBA} con clave.`); process.exit(1); }
  const clave = icgDecryptPass(recordset[0].NEWPASS);

  paso(1, 'Login solo por contrasena');
  let r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: clave }) });
  if (r.status !== 200) { console.error('  FALLO', r.status, r.cuerpo); process.exit(1); }
  console.log(`  usuario: ${r.cuerpo.usuario} | rol: ${r.cuerpo.rol}`);
  console.log(`  permisos: administrar=${r.cuerpo.permisos.PuedeAdministrar} crear=${r.cuerpo.permisos.PuedeCrear}`);
  console.log(`  empresas de gestion permitidas: ${r.cuerpo.empresas.length}`);
  const emp = r.cuerpo.empresas[0];
  if (!emp) { console.error('  El usuario no tiene empresas.'); process.exit(1); }
  console.log(`  primera: [${emp.codEmpresa}] ${emp.nombre}`);
  console.log(`  no expone servidor/baseDatos: ${
    ('servidor' in emp || 'baseDatos' in emp) ? 'FALLO - los expone' : 'OK'}`);

  paso(2, 'Seleccionar empresa de gestion');
  r = await api('/api/sesion/empresa', { method: 'POST', body: JSON.stringify({ codEmpresa: emp.codEmpresa }) });
  console.log(`  ${r.status === 200 ? 'OK' : 'FALLO'} -> ${JSON.stringify(r.cuerpo)}`);

  paso(3, 'Rechazo de SQL peligroso al crear un reporte');
  r = await api('/api/reportes', { method: 'POST', body: JSON.stringify({
    reporte: { Nombre: 'PRUEBA MALICIOSA', Tipo: 'SIMPLE', Area: 'GESTION' },
    consultas: [{ Rol: 'FLAT', SqlText: 'SELECT 1; DROP TABLE ARTICULOS' }],
    parametros: [], columnas: []
  }) });
  console.log(`  status ${r.status} (se espera 400) -> ${r.cuerpo?.error}`);

  paso(4, 'Crear un reporte valido con parametro');
  r = await api('/api/reportes', { method: 'POST', body: JSON.stringify({
    reporte: { Nombre: 'E2E Articulos', Descripcion: 'Prueba automatica', Tipo: 'SIMPLE', Area: 'GESTION' },
    consultas: [{ Rol: 'FLAT', SqlText:
      'SELECT TOP 20 CODARTICULO, DESCRIPCION, DPTO, SECCION FROM ARTICULOS WHERE DPTO >= {DPTO_MIN} ORDER BY CODARTICULO' }],
    parametros: [{ Nombre: 'DPTO_MIN', Etiqueta: 'Departamento minimo', TipoDato: 'INT',
      Clase: 'VALOR', ControlUI: 'TEXTO', Obligatorio: false, ValorDefault: '0', Orden: 0 }],
    columnas: []
  }) });
  if (r.status !== 201) { console.error('  FALLO', r.status, r.cuerpo); process.exit(1); }
  const reporteId = r.cuerpo.ReporteId;
  console.log(`  creado ReporteId=${reporteId}`);

  paso(5, 'Descubrir columnas (modo diseno)');
  r = await api('/api/reportes/columnas/descubrir', { method: 'POST', body: JSON.stringify({
    sqlText: 'SELECT TOP 20 CODARTICULO, DESCRIPCION, DPTO, SECCION FROM ARTICULOS WHERE DPTO >= {DPTO_MIN}',
    definiciones: [{ Nombre: 'DPTO_MIN', TipoDato: 'INT', Clase: 'VALOR', ControlUI: 'TEXTO', ValorDefault: '0' }],
    parametros: { DPTO_MIN: '0' }, area: 'GESTION'
  }) });
  if (r.status === 200) {
    console.log(`  columnas: ${r.cuerpo.columnas.map(c => `${c.NombreCampo}:${c.Formato}`).join(', ')}`);
    console.log(`  filas de muestra: ${r.cuerpo.muestra.length}`);
  } else console.error('  FALLO', r.status, r.cuerpo);

  paso(6, 'Ejecutar el reporte contra la BD real');
  r = await api(`/api/reportes/${reporteId}/ejecutar`, { method: 'POST',
    body: JSON.stringify({ parametros: { DPTO_MIN: '0' } }) });
  if (r.status === 200) {
    console.log(`  filas: ${r.cuerpo.rowCount} | empresa: ${r.cuerpo.empresa.nombre}`);
    const f = r.cuerpo.rows[0];
    if (f) console.log(`  primera fila: ${JSON.stringify(f).slice(0, 110)}`);
  } else console.error('  FALLO', r.status, r.cuerpo);

  paso(7, 'Inyeccion via parametro (debe viajar como dato, no como SQL)');
  r = await api(`/api/reportes/${reporteId}/ejecutar`, { method: 'POST',
    body: JSON.stringify({ parametros: { DPTO_MIN: "0; DROP TABLE ARTICULOS--" } }) });
  console.log(`  status ${r.status} -> ${r.status === 200
    ? `ejecuto sin danno, ${r.cuerpo.rowCount} filas` : (r.cuerpo?.error || '').slice(0, 90)}`);
  // ARTICULOS vive en la BD de la EMPRESA (no en GENERAL): se resuelve su
  // ubicacion desde PATHBD antes de comprobar que sigue intacta.
  const pool2 = await conectarGeneral();
  const { recordset: rutas } = await pool2.request()
    .input('c', sql.Int, emp.codEmpresa)
    .query(`SELECT PATHBD FROM dbo.EMPRESAS WHERE CODEMPRESA = @c`);
  await pool2.close();
  const bd = (rutas[0]?.PATHBD || '').split(':')[1];
  if (bd) {
    const pool3 = await new sql.ConnectionPool({
      server: process.env.GENERAL_DB_SERVER, database: bd,
      user: process.env.DATA_DB_DEFAULT_USER, password: process.env.DATA_DB_DEFAULT_PASSWORD,
      options: { encrypt: false, trustServerCertificate: true }
    }).connect();
    const chk = await pool3.request().query(
      `SELECT COUNT(*) AS filas FROM ARTICULOS`);
    await pool3.close();
    console.log(`  tabla ARTICULOS en ${bd}: ${chk.recordset[0].filas} filas -> INTACTA`);
  }

  paso(8, 'Exportar a CSV');
  const res = await fetch(`${BASE}/api/reportes/${reporteId}/exportar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ formato: 'CSV', parametros: { DPTO_MIN: '0' } })
  });
  const csv = await res.text();
  console.log(`  status ${res.status} | ${csv.split('\r\n').length} lineas | cabecera: ${csv.split('\r\n')[0].slice(0, 70)}`);

  paso('8b', 'Exportar a PDF con orientacion y tamano de hoja');
  for (const [orientacion, hoja] of [['VERTICAL', 'A4'], ['HORIZONTAL', 'LEGAL']]) {
    const resPdf = await fetch(`${BASE}/api/reportes/${reporteId}/exportar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ formato: 'PDF', parametros: { DPTO_MIN: '0' },
        orientacion, tamanoHoja: hoja })
    });
    const buf = Buffer.from(await resPdf.arrayBuffer());
    const cabecera = buf.subarray(0, 5).toString('latin1');
    // El MediaBox del PDF lleva las dimensiones reales de la pagina.
    const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(buf.toString('latin1'));
    const medida = m ? `${Math.round(m[1])}x${Math.round(m[2])} pt` : '(sin medir)';
    console.log(`  ${orientacion.padEnd(10)} ${hoja.padEnd(6)} status ${resPdf.status} | ` +
                `${cabecera} | ${medida} | ${(buf.length / 1024).toFixed(1)} KB`);
    if (cabecera !== '%PDF-') console.error('  FALLO: la respuesta no es un PDF');
  }

  paso(9, 'Portabilidad: exportar definicion');
  r = await api(`/api/reportes/${reporteId}/definicion`);
  console.log(`  status ${r.status} | formato: ${r.cuerpo?.formato} | parametros: ${r.cuerpo?.parametros?.length}`);
  const bundle = r.cuerpo;

  paso(10, 'Portabilidad: analizar antes de importar');
  r = await api('/api/reportes/definicion/analizar', { method: 'POST', body: JSON.stringify({ bundle }) });
  console.log(`  valido=${r.cuerpo?.valido} | problemas: ${JSON.stringify(r.cuerpo?.problemas?.map(p => p.nivel))}`);

  paso(11, 'Auditoria: eventos registrados');
  r = await api('/api/auditoria/eventos?top=12');
  if (r.status === 200) {
    for (const e of r.cuerpo.slice(0, 8)) {
      console.log(`  ${String(e.Tipo).padEnd(20)} ${e.Exitoso ? 'ok ' : 'ERR'} ${e.LoginICG || '-'} :: ${(e.Descripcion || '').slice(0, 58)}`);
    }
  } else console.error('  FALLO', r.status, r.cuerpo);

  paso(12, 'Historial de versiones del reporte');
  r = await api(`/api/reportes/${reporteId}/versiones`);
  console.log(`  versiones: ${r.cuerpo?.length} -> ${r.cuerpo?.map(v => `v${v.Version}:${v.Accion}`).join(', ')}`);

  paso(13, 'Estadisticas de uso');
  r = await api('/api/auditoria/estadisticas?dias=1');
  const t = r.cuerpo?.totales || {};
  console.log(`  ejecuciones=${t.Ejecuciones} usuarios=${t.UsuariosActivos} errores=${t.Errores} media=${Math.round(t.DuracionMediaMs || 0)}ms`);

  paso(14, 'Limpieza: eliminar el reporte de prueba');
  r = await api(`/api/reportes/${reporteId}`, { method: 'DELETE' });
  console.log(`  status ${r.status}`);

  console.log('\n=== PRUEBA END-TO-END COMPLETADA ===\n');
  process.exit(0);
})().catch(e => { console.error('\nERROR NO CONTROLADO:', e.message); process.exit(1); });
