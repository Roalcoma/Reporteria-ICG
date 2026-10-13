'use strict';
const repo = require('./reporteRepository');
const cm = require('../db/connectionManager');
const { authService } = require('./authService');
const { createExecutor } = require('../engine/reportExecutor');
const engine = require('../engine/queryTemplateEngine');
const { validarSqlReporte } = require('../engine/sqlGuard');

/**
 * Orquesta la ejecución de un reporte: valida el permiso sobre la empresa,
 * resuelve el destino (servidor+BD vía PATHBD), ejecuta con parámetros enlazados
 * y registra la ejecución.
 *
 * seleccion = { codEmpresa, ejercicio? }  parametros = { NOMBRE: valor }
 */
class ReporteService {
  async ejecutar(reporteId, seleccion, parametros, sessionUser, empresaGestionSesion = null) {
    const def = await repo.getReporteFull(reporteId);
    if (!def) { const e = new Error('Reporte no encontrado'); e.status = 404; throw e; }

    const { reporte, consultas, parametros: definiciones, columnas } = def;

    // Los reportes de GESTION usan la empresa activa de la sesion; los CONTABLES
    // exigen que el usuario elija empresa contable + ejercicio en la pantalla.
    if (reporte.Area === 'GESTION' && seleccion.codEmpresa == null) {
      if (!empresaGestionSesion) {
        const e = new Error('Seleccione una empresa de gestion'); e.status = 400; throw e;
      }
      seleccion = { codEmpresa: empresaGestionSesion.codEmpresa };
    }

    // Verifica que el usuario tenga permiso sobre la empresa elegida y obtiene destino.
    const emp = await authService.assertEmpresaPermitida(
      sessionUser.codUsuario, reporte.Area, seleccion.codEmpresa, seleccion.ejercicio);

    const contexto = { destino: { servidor: emp.servidor, baseDatos: emp.baseDatos },
      definiciones, consultas };
    const executor = createExecutor(reporte, contexto);

    const t0 = Date.now();
    try {
      const resultado = await executor.execute(parametros || {});
      await repo.logEjecucion({
        reporteId, usuarioAppId: sessionUser.appRol?.UsuarioAppId,
        codUsuarioICG: sessionUser.codUsuario, loginICG: sessionUser.usuario,
        empresaId: null, parametros, duracionMs: Date.now() - t0,
        filas: resultado.rowCount, estado: 'OK'
      });
      return { reporte, columnas, empresa: { nombre: emp.nombre, ...seleccion }, ...resultado };
    } catch (err) {
      await repo.logEjecucion({
        reporteId, usuarioAppId: sessionUser.appRol?.UsuarioAppId,
        codUsuarioICG: sessionUser.codUsuario, loginICG: sessionUser.usuario,
        parametros, duracionMs: Date.now() - t0, estado: 'ERROR', error: err.message
      });
      throw err;
    }
  }

  /**
   * Ejecuta una consulta en modo diseño para descubrir las columnas que
   * devuelve, sin necesidad de guardar el reporte. Devuelve los metadatos de
   * cada columna, un formato sugerido según su tipo SQL y unas filas de muestra.
   *
   * Se usa desde el editor: evita que el creador tenga que escribir a mano los
   * nombres de campo y sus formatos.
   */
  async descubrirColumnas({ sqlText, definiciones = [], valores = {}, area, seleccion }, sessionUser,
    empresaGestionSesion = null) {
    let sel = seleccion || {};
    if (area === 'GESTION' && sel.codEmpresa == null) {
      if (!empresaGestionSesion) {
        const e = new Error('Seleccione una empresa de gestión'); e.status = 400; throw e;
      }
      sel = { codEmpresa: empresaGestionSesion.codEmpresa };
    }
    const emp = await authService.assertEmpresaPermitida(
      sessionUser.codUsuario, area, sel.codEmpresa, sel.ejercicio);

    const pool = await cm.getDataPool({ servidor: emp.servidor, baseDatos: emp.baseDatos });
    const req = pool.request();
    // Misma guarda que al ejecutar: el modo diseño no es una puerta trasera.
    const finalSql = engine.build(sqlText, definiciones, valores, req);

    const rs = await req.query(finalSql);
    const meta = rs.recordset?.columns || {};
    const columnas = Object.keys(meta).map((nombre, i) => {
      const c = meta[nombre];
      const tipo = (c.type && c.type.declaration) ? c.type.declaration.toLowerCase() : '';
      return {
        NombreCampo: nombre || `Columna${i + 1}`,
        AliasVisible: nombre,
        TipoSql: tipo,
        Formato: sugerirFormato(tipo, c.scale),
        VisiblePorDefecto: true,
        EsAdicional: false,
        EsAgrupable: esTextual(tipo),
        AgregacionPie: esNumerico(tipo) ? 'SUMA' : 'NINGUNA',
        Orden: i
      };
    });

    return {
      columnas,
      muestra: (rs.recordset || []).slice(0, 20),
      totalFilas: rs.recordset ? rs.recordset.length : 0
    };
  }

  /**
   * Puebla las opciones de un parámetro tipo LISTA_SQL ejecutando su SqlOrigen
   * (autoría del creador) contra la BD de datos de la empresa seleccionada.
   */
  async getOpcionesDinamicas(reporteId, parametroId, seleccion, sessionUser) {
    const def = await repo.getReporteFull(reporteId);
    if (!def) { const e = new Error('Reporte no encontrado'); e.status = 404; throw e; }
    const p = def.parametros.find(x => x.ParametroId === Number(parametroId));
    if (!p || p.ControlUI !== 'LISTA_SQL') {
      const e = new Error('Parámetro no es de tipo LISTA_SQL'); e.status = 400; throw e;
    }
    const emp = await authService.assertEmpresaPermitida(
      sessionUser.codUsuario, def.reporte.Area, seleccion.codEmpresa, seleccion.ejercicio);

    // El SQL que puebla la lista también es solo lectura: pasa por la misma guarda
    // (admite EXEC de un SP, útil para listas que vienen de un procedimiento).
    validarSqlReporte(p.SqlOrigen, `El origen del parámetro ${p.Nombre}`);

    const pool = await cm.getDataPool({ servidor: emp.servidor, baseDatos: emp.baseDatos });
    const { recordset } = await pool.request().query(p.SqlOrigen);
    const cv = p.CampoValor, ct = p.CampoTexto;
    return recordset.map(r => ({ valor: cv ? r[cv] : Object.values(r)[0],
      texto: ct ? r[ct] : (cv ? r[cv] : Object.values(r)[0]) }));
  }

  /** Devuelve las columnas de una tabla ICG vía INFORMATION_SCHEMA. */
  async getColumnasTablaIcg(tabla, sessionUser, empresaGestionSesion) {
    const safeTabla = tabla.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!safeTabla) { const e = new Error('Nombre de tabla inválido'); e.status = 400; throw e; }

    let empSel;
    if (empresaGestionSesion) {
      empSel = await authService.assertEmpresaPermitida(
        sessionUser.codUsuario, 'GESTION', empresaGestionSesion.codEmpresa, null);
    } else {
      const e = new Error('Seleccione una empresa de gestión'); e.status = 400; throw e;
    }

    const pool = await cm.getDataPool({ servidor: empSel.servidor, baseDatos: empSel.baseDatos });
    const { recordset } = await pool.request().query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = '${safeTabla}' AND TABLE_SCHEMA = 'dbo'
       ORDER BY ORDINAL_POSITION`
    );
    return recordset.map(r => ({ col: r.COLUMN_NAME, tipo: r.DATA_TYPE }));
  }
}

const TIPOS_NUMERICOS = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric',
  'money', 'smallmoney', 'float', 'real'];
const TIPOS_FECHA = ['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'];

const esNumerico = (t) => TIPOS_NUMERICOS.some(x => t.startsWith(x));
const esTextual = (t) => t.includes('char') || t.includes('text') || t === 'uniqueidentifier';

/**
 * Formato de presentación sugerido a partir del tipo SQL de la columna.
 * El creador siempre puede cambiarlo; esto solo ahorra trabajo.
 */
function sugerirFormato(tipo, escala) {
  if (!tipo) return 'TEXTO';
  if (TIPOS_FECHA.some(x => tipo.startsWith(x))) return 'FECHA';
  if (tipo.startsWith('money') || tipo.startsWith('smallmoney')) return 'MONEDA';
  if (['int', 'bigint', 'smallint', 'tinyint'].some(x => tipo.startsWith(x))) return 'ENTERO';
  if (esNumerico(tipo)) return escala && escala > 0 ? 'NUMERO' : 'ENTERO';
  return 'TEXTO';
}

module.exports = new ReporteService();
// Expuesto para pruebas y para reutilizarlo al sugerir formatos.
module.exports.sugerirFormato = sugerirFormato;
