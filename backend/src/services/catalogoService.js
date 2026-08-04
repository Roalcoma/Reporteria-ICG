'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const { authService } = require('./authService');
const { engine } = require('../engine/semanticQuery');

const CACHE_MS = 5 * 60 * 1000;

/**
 * Catálogo semántico: orígenes de datos que publicamos para que los usuarios
 * armen dashboards sin escribir SQL.
 */
class CatalogoService {
  constructor() { this._cache = null; this._cacheAt = 0; }

  /** Carga el catálogo completo (orígenes, campos y relaciones) con caché. */
  async cargar() {
    if (this._cache && Date.now() - this._cacheAt < CACHE_MS) return this._cache;
    const pool = await cm.getConfigPool();
    const rs = await pool.request().query(`
      SELECT OrigenId, Clave, Nombre, Descripcion, Tipo, SqlBase, Area, Version, Obsoleto
      FROM rep.CatalogoOrigen WHERE Activo = 1;

      SELECT c.OrigenId, o.Clave AS OrigenClave, c.Clave, c.Etiqueta, c.Descripcion,
             c.Expresion, c.Rol, c.TipoDato, c.Agregacion, c.Formato, c.Orden,
             c.Obsoleto, c.ReemplazadoPor
      FROM rep.CatalogoCampo c
      JOIN rep.CatalogoOrigen o ON o.OrigenId = c.OrigenId
      WHERE o.Activo = 1 ORDER BY c.Orden, c.Clave;

      SELECT oi.Clave AS OrigenIzq, r.CampoIzq, od.Clave AS OrigenDer, r.CampoDer,
             r.Cardinalidad, r.Activo
      FROM rep.CatalogoRelacion r
      JOIN rep.CatalogoOrigen oi ON oi.OrigenId = r.OrigenIzqId
      JOIN rep.CatalogoOrigen od ON od.OrigenId = r.OrigenDerId;`);

    const [origenes, campos, relaciones] = rs.recordsets;
    const mapa = new Map();
    for (const o of origenes) mapa.set(o.Clave, { ...o, campos: new Map() });
    for (const c of campos) {
      const o = mapa.get(c.OrigenClave);
      if (o) o.campos.set(c.Clave, c);
    }
    this._cache = { origenes: mapa, relaciones };
    this._cacheAt = Date.now();
    return this._cache;
  }

  invalidar() { this._cache = null; }

  /** Catálogo en forma serializable para la interfaz. */
  async paraUI() {
    const cat = await this.cargar();
    return {
      origenes: [...cat.origenes.values()]
        .filter(o => !o.Obsoleto)
        .map(o => ({
          clave: o.Clave, nombre: o.Nombre, descripcion: o.Descripcion,
          tipo: o.Tipo, area: o.Area, version: o.Version,
          campos: [...o.campos.values()]
            .filter(c => !c.Obsoleto)
            .map(c => ({
              clave: `${o.Clave}.${c.Clave}`, nombre: c.Clave, etiqueta: c.Etiqueta,
              descripcion: c.Descripcion, rol: c.Rol, tipoDato: c.TipoDato,
              agregacion: c.Agregacion, formato: c.Formato
            }))
        })),
      relaciones: cat.relaciones.filter(r => r.Activo).map(r => ({
        izq: r.OrigenIzq, campoIzq: r.CampoIzq,
        der: r.OrigenDer, campoDer: r.CampoDer, cardinalidad: r.Cardinalidad
      }))
    };
  }

  /**
   * Ejecuta una consulta semántica contra la base de datos de la empresa.
   * @param {object} consulta { dimensiones, metricas, filtros, orden, limite }
   */
  async consultar(consulta, sessionUser, empresaGestionSesion, seleccion = {}) {
    const cat = await this.cargar();
    const area = (consulta.area || 'GESTION').toUpperCase();

    let sel = seleccion;
    if (area === 'GESTION' && sel.codEmpresa == null) {
      if (!empresaGestionSesion) {
        const e = new Error('Seleccione una empresa de gestión'); e.status = 400; throw e;
      }
      sel = { codEmpresa: empresaGestionSesion.codEmpresa };
    }
    const emp = await authService.assertEmpresaPermitida(
      sessionUser.codUsuario, area, sel.codEmpresa, sel.ejercicio);

    const pool = await cm.getDataPool({ servidor: emp.servidor, baseDatos: emp.baseDatos });
    const request = pool.request();
    const { sql: consultaSql, columnas } = engine.construir(cat, consulta, request);

    const t0 = Date.now();
    const rs = await request.query(consultaSql);
    return {
      rows: rs.recordset || [],
      columnas,
      rowCount: (rs.recordset || []).length,
      duracionMs: Date.now() - t0,
      empresa: { nombre: emp.nombre, ...sel }
    };
  }

  /** Valores distintos de una dimensión, para poblar filtros en la interfaz. */
  async valoresDe(claveCampo, sessionUser, empresaGestionSesion, seleccion = {}) {
    return this.consultar(
      { dimensiones: [claveCampo], metricas: [], limite: 300 },
      sessionUser, empresaGestionSesion, seleccion);
  }
}

module.exports = new CatalogoService();
