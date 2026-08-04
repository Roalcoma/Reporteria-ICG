'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const reporteService = require('./reporteService');
const exportService = require('./exportService');
const brandingService = require('./brandingService');
const mailService = require('./mailService');

/**
 * Pipeline de un job programado:  ejecutar -> exportar -> enviar -> historial.
 *
 * El reporte se ejecuta CON LOS PERMISOS DEL USUARIO QUE PROGRAMO el envío
 * (Programacion.CreadoPor -> rep.UsuarioApp.CodUsuarioICG), de modo que el
 * scheduler nunca elude la validación de empresas de ICG.
 */
class JobRunner {
  /** Carga la programación con su empresa y el usuario dueño. */
  async getProgramacion(programacionId) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('id', sql.Int, programacionId)
      .query(`SELECT p.*,
                     e.CodigoICG, e.Ejercicio, e.Tipo AS EmpresaTipo,
                     ua.CodUsuarioICG, ua.UsuarioAppId
              FROM rep.Programacion p
              LEFT JOIN rep.Empresa   e  ON e.EmpresaId    = p.EmpresaId
              LEFT JOIN rep.UsuarioApp ua ON ua.UsuarioAppId = p.CreadoPor
              WHERE p.ProgramacionId = @id`);
    return recordset[0] || null;
  }

  /** Ejecuta el pipeline completo de un job. Lanza si algo falla (el worker reintenta). */
  async ejecutar(job) {
    const prog = await this.getProgramacion(job.ProgramacionId);
    if (!prog) throw new Error(`Programación ${job.ProgramacionId} no existe`);
    if (!prog.Activo) return { omitido: true };
    if (!prog.CodUsuarioICG) {
      throw new Error('La programación no tiene un usuario ICG asociado (CreadoPor)');
    }

    const parametros = prog.ParametrosJson ? JSON.parse(prog.ParametrosJson) : {};
    const seleccion = {
      codEmpresa: prog.CodigoICG ?? undefined,
      ejercicio: prog.Ejercicio ?? undefined
    };
    // Identidad efectiva: la del usuario que creó la programación.
    const sessionUser = {
      codUsuario: prog.CodUsuarioICG,
      appRol: { UsuarioAppId: prog.UsuarioAppId }
    };
    const empresaGestionSesion = prog.CodigoICG != null
      ? { codEmpresa: prog.CodigoICG } : null;

    // 1) Ejecutar (revalida permisos de empresa contra ICG).
    const out = await reporteService.ejecutar(
      prog.ReporteId, seleccion, parametros, sessionUser, empresaGestionSesion);

    // 2) Exportar en el formato configurado (HTML lleva branding).
    const formato = (prog.FormatoExportacion || 'EXCEL').toUpperCase();
    // Se usa la empresa efectiva del resultado (igual que en el envío ad-hoc).
    const branding = ['HTML', 'PDF'].includes(formato) && out.empresa?.codEmpresa != null
      ? await brandingService.getBranding(
          out.empresa.codEmpresa, prog.EmpresaTipo || out.reporte.Area, out.empresa.ejercicio)
      : null;
    const filas = out.rows || out.cabecera || [];
    const buffer = await exportService.exportar(formato, filas, out.columnas, {
      titulo: out.reporte.Nombre,
      subtitulo: out.empresa?.nombre ? `Empresa: ${out.empresa.nombre}` : null,
      branding,
      // El envío programado respeta el formato de impresión del reporte.
      orientacion: out.reporte.OrientacionPdf || 'VERTICAL',
      tamanoHoja: out.reporte.TamanoHoja || 'A4'
    });

    // 3) Enviar + 4) registrar en rep.EnvioCorreoHistorial (lo hace mailService).
    await mailService.enviarReporte({
      reporteId: prog.ReporteId,
      programacionId: prog.ProgramacionId,
      origen: 'PROGRAMADO',
      usuarioAppId: prog.UsuarioAppId,
      empresaId: prog.EmpresaId,
      destinatarios: prog.Destinatarios,
      asunto: prog.Asunto || out.reporte.Nombre,
      cuerpo: prog.Cuerpo,
      formato,
      filas: out.rowCount,
      parametros,
      correoConfigId: prog.CorreoConfigId,
      adjunto: {
        filename: `${out.reporte.Nombre}.${exportService.extension(formato)}`
          .replace(/[\\/:*?"<>|]/g, '_'),
        content: buffer,
        contentType: exportService.contentType(formato)
      }
    });

    return { filas: out.rowCount, formato };
  }
}

module.exports = new JobRunner();
