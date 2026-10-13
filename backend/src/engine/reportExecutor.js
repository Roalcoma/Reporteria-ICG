'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const engine = require('./queryTemplateEngine');

/**
 * Ejecutores de reportes. Resuelven el pool de datos a partir del destino
 * (servidor+baseDatos derivados de PATHBD, ya validado por permisos) y ejecutan
 * las consultas con parametros enlazados via queryTemplateEngine.
 *
 * `contexto` = { destino:{servidor,baseDatos}, definiciones:[...], consultas:[...] }
 */
class BaseExecutor {
  constructor(reporte, contexto) {
    this.reporte = reporte;
    this.destino = contexto.destino;
    this.definiciones = contexto.definiciones; // rep.ReporteParametro (+ .opciones)
    this.consultas = contexto.consultas;       // rep.ReporteConsulta
  }
  _pool() { return cm.getDataPool(this.destino); }
  _sql(rol) {
    const c = this.consultas.find(x => x.Rol === rol);
    if (!c) throw new Error(`Falta la consulta '${rol}' del reporte`);
    return c;
  }
}

class SimpleExecutor extends BaseExecutor {
  async execute(valores) {
    const pool = await this._pool();
    const req = pool.request();
    const finalSql = engine.build(this._sql('FLAT').SqlText, this.definiciones, valores, req);
    const rs = await req.query(finalSql);
    return { rows: rs.recordset, rowCount: rs.recordset.length };
  }
}

class MasterDetailExecutor extends BaseExecutor {
  async execute(valores) {
    const pool = await this._pool();

    const reqCab = pool.request();
    const sqlCab = engine.build(this._sql('CABECERA').SqlText, this.definiciones, valores, reqCab);
    const cabecera = (await reqCab.query(sqlCab)).recordset;

    const det = this._sql('DETALLE');
    const reqDet = pool.request();
    const sqlDet = engine.build(det.SqlText, this.definiciones, valores, reqDet);
    const detalle = (await reqDet.query(sqlDet)).recordset;

    return {
      cabecera,
      detalle,
      vinculo: { cabecera: det.CampoVinculoCabecera, detalle: det.CampoVinculoDetalle },
      rowCount: cabecera.length
    };
  }
}

class DashboardExecutor extends BaseExecutor {
  async execute(valores) {
    const pool = await this._pool();
    const req = pool.request();
    const finalSql = engine.build(this._sql('BASE').SqlText, this.definiciones, valores, req);
    const rs = await req.query(finalSql);
    // El dataset crudo se envia al frontend; alli se arman pivots/graficos.
    return { rows: rs.recordset, rowCount: rs.recordset.length };
  }
}

function createExecutor(reporte, contexto) {
  switch (reporte.Tipo) {
    case 'SIMPLE':        return new SimpleExecutor(reporte, contexto);
    case 'MASTER_DETAIL': return new MasterDetailExecutor(reporte, contexto);
    case 'DASHBOARD':     return new DashboardExecutor(reporte, contexto);
    default: throw new Error(`Tipo de reporte no soportado: ${reporte.Tipo}`);
  }
}

module.exports = { createExecutor, SimpleExecutor, MasterDetailExecutor, DashboardExecutor };
