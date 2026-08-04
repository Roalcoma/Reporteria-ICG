'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/**
 * Lista blanca de procedimientos almacenados que los reportes pueden ejecutar.
 *
 * Un reporte SÍ puede basarse en un SP, pero solo en los registrados aquí por un
 * administrador. No existe EXEC libre: el creador de reportes no puede invocar
 * cualquier procedimiento.
 *
 * ADVERTENCIA: un SP puede hacer internamente lo que quiera. La lista blanca
 * evita que se llame cualquier cosa, pero la garantía real de que no escriba
 * proviene del login SQL de solo lectura (y de que el SP no use EXECUTE AS).
 * Registre únicamente procedimientos de lectura revisados.
 */
const CACHE_MS = 60 * 1000;

class ProcedimientoService {
  constructor() { this._cache = null; this._cacheAt = 0; }

  /** @returns {Promise<Set<string>>} claves 'esquema.nombre' en minúsculas. */
  async getPermitidos() {
    if (this._cache && Date.now() - this._cacheAt < CACHE_MS) return this._cache;
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(
      `SELECT Esquema, Nombre FROM rep.ProcedimientoPermitido WHERE Activo = 1`);
    this._cache = new Set(recordset.map(r =>
      `${(r.Esquema || 'dbo').toLowerCase()}.${r.Nombre.toLowerCase()}`));
    this._cacheAt = Date.now();
    return this._cache;
  }

  invalidarCache() { this._cache = null; }

  async listar() {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(
      `SELECT ProcedimientoId, Esquema, Nombre, Descripcion, BaseDatos, Activo,
              LoginAutorizador, FechaAutorizacion
       FROM rep.ProcedimientoPermitido
       ORDER BY Esquema, Nombre`);
    return recordset;
  }

  /** Registra un SP autorizado. El nombre se valida como identificador simple. */
  async autorizar({ esquema = 'dbo', nombre, descripcion, baseDatos }, usuario) {
    const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!ident.test(nombre) || !ident.test(esquema)) {
      const e = new Error('Nombre de procedimiento inválido'); e.status = 400; throw e;
    }
    if (/^(sp_|xp_)/i.test(nombre)) {
      const e = new Error('No se pueden autorizar procedimientos del sistema');
      e.status = 400; throw e;
    }
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('esq', sql.NVarChar(128), esquema)
      .input('nom', sql.NVarChar(128), nombre)
      .input('desc', sql.NVarChar(400), descripcion ?? null)
      .input('bd', sql.NVarChar(128), baseDatos ?? null)
      .input('uid', sql.Int, usuario?.appRol?.UsuarioAppId ?? null)
      .input('login', sql.NVarChar(60), usuario?.usuario ?? null)
      .query(`INSERT INTO rep.ProcedimientoPermitido
              (Esquema, Nombre, Descripcion, BaseDatos, AutorizadoPor, LoginAutorizador)
              OUTPUT inserted.ProcedimientoId
              VALUES (@esq, @nom, @desc, @bd, @uid, @login)`);
    this.invalidarCache();
    return recordset[0].ProcedimientoId;
  }

  async cambiarActivo(procedimientoId, activo) {
    const pool = await cm.getConfigPool();
    await pool.request()
      .input('id', sql.Int, procedimientoId)
      .input('a', sql.Bit, !!activo)
      .query(`UPDATE rep.ProcedimientoPermitido SET Activo = @a WHERE ProcedimientoId = @id`);
    this.invalidarCache();
  }

  async eliminar(procedimientoId) {
    const pool = await cm.getConfigPool();
    await pool.request().input('id', sql.Int, procedimientoId)
      .query(`DELETE FROM rep.ProcedimientoPermitido WHERE ProcedimientoId = @id`);
    this.invalidarCache();
  }

  /**
   * Ayuda al administrador: lista los SP existentes en una BD de datos para
   * elegir cuáles autorizar (solo nombres, no ejecuta nada).
   */
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
}

module.exports = new ProcedimientoService();
