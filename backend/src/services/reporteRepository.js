'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const { validarSqlReporte } = require('../engine/sqlGuard');
const procedimientos = require('./procedimientoService');

/**
 * Acceso a las definiciones de reportes en la BD de configuración (esquema rep).
 * Todo lo que aquí se lee/escribe vive en ICG_Reporteria_Config, nunca en ICG.
 */
class ReporteRepository {
  async _pool() { return cm.getConfigPool(); }

  /** Árbol de carpetas (grupos/subgrupos) plano; el frontend arma la jerarquía. */
  async getArbolCarpetas() {
    const pool = await this._pool();
    const { recordset } = await pool.request().query(
      `SELECT CarpetaId, CarpetaPadreId, Nombre, Orden
       FROM rep.Carpeta WHERE Activo = 1 ORDER BY Orden, Nombre`);
    return recordset;
  }

  /** Lista de reportes (metadatos), opcionalmente filtrada por carpeta. */
  async listReportes(carpetaId) {
    const pool = await this._pool();
    const req = pool.request();
    let where = 'WHERE Activo = 1';
    if (carpetaId != null) { req.input('c', sql.Int, carpetaId); where += ' AND CarpetaId = @c'; }
    const { recordset } = await req.query(
      `SELECT ReporteId, CarpetaId, Nombre, Descripcion, Tipo, Area, Version
       FROM rep.Reporte ${where} ORDER BY Nombre`);
    return recordset;
  }

  /** Definición COMPLETA de un reporte (consultas + parámetros + opciones + columnas). */
  async getReporteFull(reporteId) {
    const pool = await this._pool();
    const req = pool.request().input('id', sql.Int, reporteId);
    const rs = await req.query(`
      SELECT * FROM rep.Reporte           WHERE ReporteId = @id;
      SELECT * FROM rep.ReporteConsulta   WHERE ReporteId = @id ORDER BY Orden;
      SELECT * FROM rep.ReporteParametro  WHERE ReporteId = @id ORDER BY Orden;
      SELECT o.* FROM rep.ReporteParametroOpcion o
        JOIN rep.ReporteParametro p ON p.ParametroId = o.ParametroId
       WHERE p.ReporteId = @id ORDER BY o.Orden;
      SELECT * FROM rep.ReporteColumna    WHERE ReporteId = @id ORDER BY Orden;`);

    const [reporteRows, consultas, parametros, opciones, columnas] = rs.recordsets;
    const reporte = reporteRows[0];
    if (!reporte) return null;

    // Parsea las preferencias de vista guardadas
    if (reporte.VistaJson) {
      try { reporte.Vista = JSON.parse(reporte.VistaJson); } catch { reporte.Vista = null; }
    } else {
      reporte.Vista = null;
    }

    // Anida opciones dentro de cada parámetro (para whitelist y listas estáticas).
    const opsByParam = new Map();
    for (const o of opciones) {
      if (!opsByParam.has(o.ParametroId)) opsByParam.set(o.ParametroId, []);
      opsByParam.get(o.ParametroId).push(o);
    }
    parametros.forEach(p => { p.opciones = opsByParam.get(p.ParametroId) || []; });

    return { reporte, consultas, parametros, columnas };
  }

  /**
   * Crea un reporte con sus hijos en una transacción.
   * @param {object} def  { reporte, consultas[], parametros[](+opciones[]), columnas[] }
   */
  /**
   * Valida TODO el SQL de una definición antes de persistirla: las consultas
   * del reporte y los orígenes de las listas dinámicas. Así nunca se guarda
   * en la base un SQL que la guarda rechazaría al ejecutar.
   */
  async _validarDefinicion(def) {
    const opciones = { procedimientosPermitidos: await procedimientos.getPermitidos() };
    for (const c of def.consultas || []) {
      validarSqlReporte(c.SqlText, `La consulta ${c.Rol}`, opciones);
    }
    for (const p of def.parametros || []) {
      if (p.ControlUI === 'LISTA_SQL' && p.SqlOrigen) {
        validarSqlReporte(p.SqlOrigen, `El origen del parámetro ${p.Nombre}`, opciones);
      }
    }
  }

  async crearReporte(def, usuarioAppId) {
    await this._validarDefinicion(def);
    const pool = await this._pool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const r = def.reporte;
      const ins = await new sql.Request(tx)
        .input('carpeta', sql.Int, r.CarpetaId ?? null)
        .input('nombre', sql.NVarChar(150), r.Nombre)
        .input('desc', sql.NVarChar(500), r.Descripcion ?? null)
        .input('tipo', sql.VarChar(15), r.Tipo)
        .input('area', sql.VarChar(10), r.Area)
        .input('creado', sql.Int, usuarioAppId ?? null)
        .input('orient', sql.VarChar(10), (r.OrientacionPdf || 'VERTICAL').toUpperCase())
        .input('hoja', sql.VarChar(10), (r.TamanoHoja || 'A4').toUpperCase())
        .query(`INSERT INTO rep.Reporte
                  (CarpetaId, Nombre, Descripcion, Tipo, Area, CreadoPor, OrientacionPdf, TamanoHoja)
                OUTPUT inserted.ReporteId
                VALUES (@carpeta, @nombre, @desc, @tipo, @area, @creado, @orient, @hoja)`);
      const reporteId = ins.recordset[0].ReporteId;
      await this._insertarHijos(tx, reporteId, def);
      await tx.commit();
      return reporteId;
    } catch (e) { await tx.rollback(); throw e; }
  }

  /** Reemplaza la definición completa (consultas/parámetros/columnas) de un reporte. */
  async actualizarReporte(reporteId, def, usuarioAppId) {
    await this._validarDefinicion(def);
    const pool = await this._pool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const r = def.reporte;
      await new sql.Request(tx)
        .input('id', sql.Int, reporteId)
        .input('carpeta', sql.Int, r.CarpetaId ?? null)
        .input('nombre', sql.NVarChar(150), r.Nombre)
        .input('desc', sql.NVarChar(500), r.Descripcion ?? null)
        .input('tipo', sql.VarChar(15), r.Tipo)
        .input('area', sql.VarChar(10), r.Area)
        .input('mod', sql.Int, usuarioAppId ?? null)
        .input('orient', sql.VarChar(10), (r.OrientacionPdf || 'VERTICAL').toUpperCase())
        .input('hoja', sql.VarChar(10), (r.TamanoHoja || 'A4').toUpperCase())
        .query(`UPDATE rep.Reporte
                SET CarpetaId=@carpeta, Nombre=@nombre, Descripcion=@desc, Tipo=@tipo,
                    Area=@area, OrientacionPdf=@orient, TamanoHoja=@hoja,
                    Version=Version+1, ModificadoPor=@mod, FechaModificacion=SYSDATETIME()
                WHERE ReporteId=@id`);
      // Borra hijos y reinserta (ON DELETE CASCADE cubre opciones vía parámetros).
      for (const t of ['rep.ReporteColumna', 'rep.ReporteParametro', 'rep.ReporteConsulta']) {
        await new sql.Request(tx).input('id', sql.Int, reporteId)
          .query(`DELETE FROM ${t} WHERE ReporteId=@id`);
      }
      await this._insertarHijos(tx, reporteId, def);
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }

  async _insertarHijos(tx, reporteId, def) {
    for (const c of def.consultas || []) {
      await new sql.Request(tx)
        .input('id', sql.Int, reporteId)
        .input('rol', sql.VarChar(10), c.Rol)
        .input('sql', sql.NVarChar(sql.MAX), c.SqlText)
        .input('vc', sql.NVarChar(128), c.CampoVinculoCabecera ?? null)
        .input('vd', sql.NVarChar(128), c.CampoVinculoDetalle ?? null)
        .input('ord', sql.Int, c.Orden ?? 0)
        .query(`INSERT INTO rep.ReporteConsulta
                (ReporteId, Rol, SqlText, CampoVinculoCabecera, CampoVinculoDetalle, Orden)
                VALUES (@id, @rol, @sql, @vc, @vd, @ord)`);
    }
    for (const p of def.parametros || []) {
      const insP = await new sql.Request(tx)
        .input('id', sql.Int, reporteId)
        .input('nombre', sql.NVarChar(50), p.Nombre)
        .input('etq', sql.NVarChar(120), p.Etiqueta)
        .input('tipo', sql.VarChar(10), p.TipoDato)
        .input('clase', sql.VarChar(15), p.Clase || 'VALOR')
        .input('ui', sql.VarChar(20), p.ControlUI)
        .input('obl', sql.Bit, !!p.Obligatorio)
        .input('mult', sql.Bit, !!p.PermiteMultiple)
        .input('def', sql.NVarChar(400), p.ValorDefault ?? null)
        .input('prec', sql.TinyInt, p.Precision ?? null)
        .input('esc', sql.TinyInt, p.Escala ?? null)
        .input('sqlo', sql.NVarChar(sql.MAX), p.SqlOrigen ?? null)
        .input('cv', sql.NVarChar(128), p.CampoValor ?? null)
        .input('ct', sql.NVarChar(128), p.CampoTexto ?? null)
        .input('ord', sql.Int, p.Orden ?? 0)
        .query(`INSERT INTO rep.ReporteParametro
                (ReporteId,Nombre,Etiqueta,TipoDato,Clase,ControlUI,Obligatorio,PermiteMultiple,
                 ValorDefault,Precision,Escala,SqlOrigen,CampoValor,CampoTexto,Orden)
                OUTPUT inserted.ParametroId
                VALUES (@id,@nombre,@etq,@tipo,@clase,@ui,@obl,@mult,@def,@prec,@esc,@sqlo,@cv,@ct,@ord)`);
      const paramId = insP.recordset[0].ParametroId;
      for (const o of p.opciones || []) {
        await new sql.Request(tx)
          .input('pid', sql.Int, paramId)
          .input('val', sql.NVarChar(200), o.Valor)
          .input('txt', sql.NVarChar(200), o.Texto)
          .input('ord', sql.Int, o.Orden ?? 0)
          .query(`INSERT INTO rep.ReporteParametroOpcion (ParametroId, Valor, Texto, Orden)
                  VALUES (@pid, @val, @txt, @ord)`);
      }
    }
    for (const col of def.columnas || []) {
      await new sql.Request(tx)
        .input('id', sql.Int, reporteId)
        .input('cr', sql.VarChar(10), col.ConsultaRol || 'FLAT')
        .input('campo', sql.NVarChar(128), col.NombreCampo)
        .input('alias', sql.NVarChar(150), col.AliasVisible ?? null)
        .input('fmt', sql.VarChar(12), col.Formato || 'TEXTO')
        .input('pat', sql.NVarChar(40), col.FormatoPatron ?? null)
        .input('vis', sql.Bit, col.VisiblePorDefecto == null ? true : !!col.VisiblePorDefecto)
        .input('adic', sql.Bit, !!col.EsAdicional)
        .input('agrup', sql.Bit, !!col.EsAgrupable)
        .input('agg', sql.VarChar(10), col.AgregacionPie || 'NINGUNA')
        .input('ord', sql.Int, col.Orden ?? 0)
        .query(`INSERT INTO rep.ReporteColumna
                (ReporteId,ConsultaRol,NombreCampo,AliasVisible,Formato,FormatoPatron,
                 VisiblePorDefecto,EsAdicional,EsAgrupable,AgregacionPie,Orden)
                VALUES (@id,@cr,@campo,@alias,@fmt,@pat,@vis,@adic,@agrup,@agg,@ord)`);
    }
  }

  /** Guarda las preferencias de vista del reporte (orden, agrupado, alias, totales, formatos). */
  async guardarVista(reporteId, vista) {
    const pool = await this._pool();
    await pool.request()
      .input('id',    sql.Int,               reporteId)
      .input('vista', sql.NVarChar(sql.MAX), vista ? JSON.stringify(vista) : null)
      .query(`UPDATE rep.Reporte SET VistaJson=@vista WHERE ReporteId=@id`);
  }

  /** Soft-delete del reporte. */
  async eliminarReporte(reporteId) {
    const pool = await this._pool();
    await pool.request().input('id', sql.Int, reporteId)
      .query(`UPDATE rep.Reporte SET Activo=0 WHERE ReporteId=@id`);
  }

  /**
   * Registra una ejecución para auditoría/rendimiento.
   * Se guarda también el código de usuario de ICG: UsuarioAppId es NULL para
   * quien no tiene rol asignado (entra como 'Lectura') y para los
   * administradores de arranque, y sin él se perdería quién consultó.
   */
  async logEjecucion({ reporteId, usuarioAppId, codUsuarioICG, loginICG, empresaId,
    parametros, duracionMs, filas, estado, error }) {
    const pool = await this._pool();
    await pool.request()
      .input('rid', sql.Int, reporteId)
      .input('uid', sql.Int, usuarioAppId ?? null)
      .input('cod', sql.Int, codUsuarioICG ?? null)
      .input('login', sql.NVarChar(60), loginICG ?? null)
      .input('eid', sql.Int, empresaId ?? null)
      .input('par', sql.NVarChar(sql.MAX), parametros ? JSON.stringify(parametros) : null)
      .input('dur', sql.Int, duracionMs ?? null)
      .input('fil', sql.Int, filas ?? null)
      .input('est', sql.VarChar(6), estado || 'OK')
      .input('err', sql.NVarChar(sql.MAX), error ? String(error).slice(0, 3900) : null)
      .query(`INSERT INTO rep.EjecucionLog
              (ReporteId,UsuarioAppId,CodUsuarioICG,LoginICG,EmpresaId,ParametrosJson,
               DuracionMs,FilasResultado,Estado,MensajeError)
              VALUES (@rid,@uid,@cod,@login,@eid,@par,@dur,@fil,@est,@err)`);
  }
}

module.exports = new ReporteRepository();
