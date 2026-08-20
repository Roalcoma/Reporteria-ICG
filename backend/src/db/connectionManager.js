'use strict';
const sql = require('mssql');
const cfg = require('../config');
const { decrypt } = require('../services/crypto');

/**
 * Administra los tres tipos de conexion:
 *   1) configPool  -> ICG_Reporteria_Config  (FIJO, se crea una vez)
 *   2) generalPool -> GENERAL de ICG         (auth + permisos, solo lectura)
 *   3) dataPools   -> BD de empresas ICG      (creados al vuelo, cacheados con TTL)
 *
 * El servidor/BD de cada empresa se derivan de PATHBD ('SERVIDOR:BASEDATOS'),
 * NO se guardan en la BD de configuracion. La credencial de lectura se resuelve
 * por servidor desde rep.ServidorCredencial (o el default del .env).
 */
class ConnectionManager {
  constructor() {
    this._configPool = null;
    this._generalPool = null;
    this._dataPools = new Map();          // key `${servidor}::${bd}` -> { pool, lastUsed }
    this._credCache = null;               // Map servidor -> { user, password }
    this._ttlMs = cfg.dataPool.idleMinutes * 60 * 1000;
    this._sweeper = setInterval(() => this._evictIdle(), 5 * 60 * 1000);
    this._sweeper.unref();
  }

  async getConfigPool() {
    // Store the Promise immediately (before awaiting) so concurrent callers
    // see a truthy value and share the same in-flight connection instead of
    // each creating their own, which would leak all but the last.
    if (!this._configPool) {
      this._configPool = new sql.ConnectionPool(cfg.configDb).connect();
    }
    return this._configPool;
  }

  async getGeneralPool() {
    if (!this._generalPool) {
      this._generalPool = new sql.ConnectionPool(cfg.generalDb).connect();
    }
    return this._generalPool;
  }

  /**
   * Devuelve (creando/cacheando) un pool de SOLO LECTURA hacia la BD de datos.
   * @param {{servidor:string, baseDatos:string}} destino  parseado de PATHBD
   */
  async getDataPool({ servidor, baseDatos }) {
    if (!servidor || !baseDatos) {
      throw new Error(`Destino de conexion invalido: ${servidor}:${baseDatos}`);
    }
    const key = `${servidor.toLowerCase()}::${baseDatos.toLowerCase()}`;
    const hit = this._dataPools.get(key);
    if (hit) { hit.lastUsed = Date.now(); return hit.pool; }

    // Build the Promise chain BEFORE any await and store it immediately so
    // concurrent callers racing here share the same in-flight connection.
    const pool = this._resolveCred(servidor).then(cred =>
      new sql.ConnectionPool({
        server: servidor,
        database: baseDatos,
        user: cred.user,
        password: cred.password,
        pool: { max: cfg.dataPool.max, min: 0, idleTimeoutMillis: 30000 },
        ...cfg.commonOptions,
        options: { ...cfg.commonOptions.options, readOnlyIntent: true }
      }).connect()
    );
    this._dataPools.set(key, { pool, lastUsed: Date.now() });
    // Remove entry on failure so the next call retries cleanly.
    pool.catch(() => this._dataPools.delete(key));
    return pool;
  }

  /** Credencial de lectura por servidor (cache; fallback al default del .env). */
  async _resolveCred(servidor) {
    if (!this._credCache) {
      const pool = await this.getConfigPool();
      const { recordset } = await pool.request().query(
        `SELECT Servidor, UsuarioSql, PasswordEnc
         FROM rep.ServidorCredencial WHERE Activo = 1`
      );
      this._credCache = new Map(
        recordset.map(r => [r.Servidor.toLowerCase(), {
          user: r.UsuarioSql,
          password: r.PasswordEnc ? decrypt(r.PasswordEnc) : null
        }])
      );
    }
    return this._credCache.get(servidor.toLowerCase()) || {
      user: cfg.dataDbDefault.user,
      password: cfg.dataDbDefault.password
    };
  }

  /** Invalida el cache de credenciales (llamar tras editar rep.ServidorCredencial). */
  clearCredCache() { this._credCache = null; }

  _evictIdle() {
    const now = Date.now();
    for (const [key, v] of this._dataPools) {
      if (now - v.lastUsed > this._ttlMs) {
        // v.pool may be a Promise<Pool> — resolve before calling close().
        Promise.resolve(v.pool).then(p => p.close()).catch(() => {});
        this._dataPools.delete(key);
      }
    }
  }

  async closeAll() {
    clearInterval(this._sweeper);
    const close = p => Promise.resolve(p).then(pool => pool.close()).catch(() => {});
    const all = [
      this._configPool  && close(this._configPool),
      this._generalPool && close(this._generalPool),
      ...[...this._dataPools.values()].map(v => close(v.pool))
    ].filter(Boolean);
    await Promise.allSettled(all);
  }
}

module.exports = new ConnectionManager(); // singleton
