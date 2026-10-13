'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/**
 * Módulo Procedimientos (solo administradores): explorar SPs y vistas de la BD
 * de la empresa, leer su definición y aplicar ALTER. Los reportes pueden hacer
 * EXEC de cualquier SP de usuario sin registrarlo antes (ver sqlGuard).
 */
class ProcedimientoService {
  /** Lista los SP de una BD de datos (solo nombres, no ejecuta nada). */
  async descubrirEnBaseDatos(destino, filtro) {
    const pool = await cm.getDataPool(destino);
    const req = pool.request();
    let where = "o.type = 'P'";
    if (filtro) { req.input('f', sql.NVarChar(128), `%${filtro}%`); where += ' AND o.name LIKE @f'; }
    const { recordset } = await req.query(
      `SELECT TOP 300 s.name AS Esquema, o.name AS Nombre, o.modify_date AS Modificado
       FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
       WHERE ${where} ORDER BY o.name`);
    return recordset;
  }

  async listarVistasEmpresa(destino, filtro) {
    const pool = await cm.getDataPool(destino);
    const r = pool.request();
    let where = "o.type = 'V'";
    if (filtro) { r.input('f', sql.NVarChar(128), `%${filtro}%`); where += ' AND o.name LIKE @f'; }
    const { recordset } = await r.query(
      `SELECT TOP 300 s.name AS Esquema, o.name AS Nombre, o.modify_date AS Modificado
       FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
       WHERE ${where} ORDER BY o.name`);
    return recordset;
  }

  async getDefinicion(destino, esquema, nombre) {
    const ident = /^[A-Za-z_][A-Za-z0-9_$#]*$/;
    if (!ident.test(nombre) || !ident.test(esquema)) {
      const e = new Error('Nombre inválido'); e.status = 400; throw e;
    }
    const pool = await cm.getDataPool(destino);
    const { recordset } = await pool.request()
      .input('esq', sql.NVarChar(128), esquema)
      .input('nom', sql.NVarChar(128), nombre)
      .query(`SELECT m.definition
              FROM sys.sql_modules m
              JOIN sys.objects o ON o.object_id = m.object_id
              JOIN sys.schemas s ON s.schema_id = o.schema_id
              WHERE s.name = @esq AND o.name = @nom`);
    if (!recordset.length) {
      const e = new Error(`No se encontró la definición de ${esquema}.${nombre}`);
      e.status = 404; throw e;
    }
    return recordset[0].definition;
  }

  async alterarDefinicion(destino, definicion) {
    const pool = await cm.getDataPool(destino);
    await pool.request().batch(comoAlter(definicion));
  }
}

const CABECERA = /^(CREATE(?:\s+OR\s+ALTER)?|ALTER)\s+(PROC(?:EDURE)?|VIEW|FUNCTION)\b/i;

/**
 * SQL Server guarda la definición como `CREATE ...` (a veces con comentarios
 * antes): se convierte a ALTER para poder guardar lo que el editor cargó.
 * Cualquier otra sentencia se rechaza.
 */
function comoAlter(definicion) {
  const t = definicion || '';
  let i = 0;
  for (;;) {
    while (i < t.length && /\s/.test(t[i])) i++;
    if (t.startsWith('--', i)) { const j = t.indexOf('\n', i); i = j < 0 ? t.length : j + 1; continue; }
    if (t.startsWith('/*', i)) { const j = t.indexOf('*/', i + 2); i = j < 0 ? t.length : j + 2; continue; }
    break;
  }
  const m = CABECERA.exec(t.slice(i));
  if (!m) {
    const e = new Error('La definición debe ser un CREATE o ALTER de PROCEDURE, VIEW o FUNCTION');
    e.status = 400; throw e;
  }
  return t.slice(0, i) + `ALTER ${m[2].toUpperCase()}` + t.slice(i + m[0].length);
}

module.exports = new ProcedimientoService();
module.exports.comoAlter = comoAlter;
