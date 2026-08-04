'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/** Catálogo de tipos de evento (evita erratas al registrar). */
const EVENTO = {
  LOGIN: 'LOGIN',
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  LOGOUT: 'LOGOUT',
  EMPRESA_SELECCION: 'EMPRESA_SELECCION',
  REPORTE_CREAR: 'REPORTE_CREAR',
  REPORTE_MODIFICAR: 'REPORTE_MODIFICAR',
  REPORTE_ELIMINAR: 'REPORTE_ELIMINAR',
  REPORTE_VER: 'REPORTE_VER',
  REPORTE_EJECUTAR: 'REPORTE_EJECUTAR',
  REPORTE_EXPORTAR: 'REPORTE_EXPORTAR',
  REPORTE_ENVIAR: 'REPORTE_ENVIAR',
  REPORTE_IMPORTAR: 'REPORTE_IMPORTAR',
  REPORTE_EXPORTAR_DEF: 'REPORTE_EXPORTAR_DEF',
  PROGRAMACION_CREAR: 'PROGRAMACION_CREAR',
  PROGRAMACION_CAMBIAR: 'PROGRAMACION_CAMBIAR',
  PROGRAMACION_ELIMINAR: 'PROGRAMACION_ELIMINAR',
  SQL_RECHAZADO: 'SQL_RECHAZADO'
};

/**
 * Bitácora de la aplicación. Nunca interrumpe la operación del usuario:
 * si el registro falla, se reporta por consola pero no se propaga el error.
 */
class AuditoriaService {
  /**
   * @param {object} e { tipo, entidad?, entidadId?, usuario?, empresaCod?, ejercicio?,
   *                     descripcion?, detalle?, exitoso?, ip? }
   *   `usuario` es el objeto de sesión: { codUsuario, usuario, appRol:{UsuarioAppId} }
   */
  async registrar(e) {
    try {
      const pool = await cm.getConfigPool();
      const u = e.usuario || {};
      await pool.request()
        .input('tipo', sql.VarChar(30), e.tipo)
        .input('ent', sql.VarChar(20), e.entidad ?? null)
        .input('entId', sql.Int, e.entidadId ?? null)
        .input('uapp', sql.Int, (u.appRol && u.appRol.UsuarioAppId) ?? null)
        .input('cod', sql.Int, u.codUsuario ?? null)
        .input('login', sql.NVarChar(60), u.usuario ?? null)
        .input('emp', sql.Int, e.empresaCod ?? null)
        .input('ej', sql.Int, e.ejercicio ?? null)
        .input('desc', sql.NVarChar(400), e.descripcion ? String(e.descripcion).slice(0, 390) : null)
        .input('det', sql.NVarChar(sql.MAX), e.detalle ? JSON.stringify(e.detalle) : null)
        .input('ok', sql.Bit, e.exitoso === false ? 0 : 1)
        .input('ip', sql.NVarChar(45), e.ip ?? null)
        .query(`INSERT INTO rep.AuditoriaEvento
                (Tipo,Entidad,EntidadId,UsuarioAppId,CodUsuarioICG,LoginICG,EmpresaCod,
                 Ejercicio,Descripcion,DetalleJson,Exitoso,DireccionIp)
                VALUES (@tipo,@ent,@entId,@uapp,@cod,@login,@emp,@ej,@desc,@det,@ok,@ip)`);
    } catch (err) {
      console.error('Auditoría: no se pudo registrar el evento', e.tipo, err.message);
    }
  }

  /** Consulta la bitácora con filtros opcionales. */
  async consultar({ tipo, entidad, entidadId, codUsuario, desde, hasta, top = 200 } = {}) {
    const pool = await cm.getConfigPool();
    const req = pool.request().input('top', sql.Int, Math.min(Number(top) || 200, 1000));
    const w = ['1=1'];
    if (tipo)       { req.input('tipo', sql.VarChar(30), tipo);   w.push('Tipo = @tipo'); }
    if (entidad)    { req.input('ent', sql.VarChar(20), entidad); w.push('Entidad = @ent'); }
    if (entidadId)  { req.input('eid', sql.Int, entidadId);       w.push('EntidadId = @eid'); }
    if (codUsuario) { req.input('cod', sql.Int, codUsuario);      w.push('CodUsuarioICG = @cod'); }
    if (desde)      { req.input('d', sql.DateTime2, new Date(desde)); w.push('FechaEvento >= @d'); }
    if (hasta)      { req.input('h', sql.DateTime2, new Date(hasta)); w.push('FechaEvento <= @h'); }

    const { recordset } = await req.query(
      `SELECT TOP (@top) EventoId, Tipo, Entidad, EntidadId, LoginICG, CodUsuarioICG,
              EmpresaCod, Ejercicio, Descripcion, DetalleJson, Exitoso, FechaEvento
       FROM rep.AuditoriaEvento
       WHERE ${w.join(' AND ')}
       ORDER BY FechaEvento DESC`);
    return recordset;
  }
}

module.exports = { auditoria: new AuditoriaService(), EVENTO };
