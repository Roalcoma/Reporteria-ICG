'use strict';
const express = require('express');
const sql = require('mssql');
const cm = require('../db/connectionManager');
const { auditoria } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

/** La auditoría solo es visible para roles con privilegio de edición. */
function requireAuditor(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !(rol.PuedeEditar || rol.PuedeCrear)) {
    return res.status(403).json({ error: 'Sin permiso para ver la auditoría' });
  }
  next();
}

/** Bitácora de eventos con filtros: ?tipo=&entidad=&entidadId=&codUsuario=&desde=&hasta=&top= */
router.get('/eventos', requireAuditor, asyncH(async (req, res) => {
  res.json(await auditoria.consultar(req.query));
}));

/** Catálogo de tipos de evento presentes (para poblar el filtro de la UI). */
router.get('/tipos', requireAuditor, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request().query(
    `SELECT Tipo, COUNT(*) AS Total FROM rep.AuditoriaEvento GROUP BY Tipo ORDER BY Total DESC`);
  res.json(recordset);
}));

/** Resumen general para el panel de estadísticas. */
router.get('/estadisticas', requireAuditor, asyncH(async (req, res) => {
  const dias = Math.min(Number(req.query.dias) || 30, 365);
  const pool = await cm.getConfigPool();
  const rs = await pool.request()
    .input('d', sql.Int, dias)
    .query(`
      -- 0: totales del periodo (por identidad de ICG: UsuarioAppId es NULL
      --    para quien no tiene rol asignado explicitamente)
      SELECT COUNT(*) AS Ejecuciones,
             COUNT(DISTINCT CodUsuarioICG) AS UsuariosActivos,
             COUNT(DISTINCT ReporteId)    AS ReportesUsados,
             SUM(CASE WHEN Estado='ERROR' THEN 1 ELSE 0 END) AS Errores,
             AVG(CAST(DuracionMs AS BIGINT)) AS DuracionMediaMs
      FROM rep.EjecucionLog
      WHERE FechaEjecucion >= DATEADD(DAY, -@d, SYSDATETIME());

      -- 1: reportes más consultados
      SELECT TOP 15 * FROM rep.vw_EstadisticasReporte
      WHERE Ejecuciones > 0 ORDER BY Ejecuciones DESC;

      -- 2: usuarios más activos
      SELECT TOP 15 * FROM rep.vw_EstadisticasUsuario
      WHERE Ejecuciones > 0 ORDER BY Ejecuciones DESC;

      -- 3: actividad diaria
      SELECT * FROM rep.vw_ActividadDiaria
      WHERE Dia >= CAST(DATEADD(DAY, -@d, SYSDATETIME()) AS DATE)
      ORDER BY Dia;

      -- 4: reportes más lentos
      SELECT TOP 10 * FROM rep.vw_EstadisticasReporte
      WHERE Ejecuciones > 0 ORDER BY DuracionMediaMs DESC;

      -- 5: reportes nunca usados
      SELECT ReporteId, Nombre, Tipo, Area FROM rep.vw_EstadisticasReporte
      WHERE Ejecuciones = 0;

      -- 6: eventos por tipo en el periodo
      SELECT Tipo, COUNT(*) AS Total FROM rep.AuditoriaEvento
      WHERE FechaEvento >= DATEADD(DAY, -@d, SYSDATETIME())
      GROUP BY Tipo ORDER BY Total DESC;`);

  const [totales, masUsados, usuarios, diaria, masLentos, sinUso, porTipo] = rs.recordsets;
  res.json({
    dias,
    totales: totales[0] || {},
    masUsados, usuarios, actividadDiaria: diaria, masLentos, sinUso, eventosPorTipo: porTipo
  });
}));

/** Historial de ejecuciones de un reporte (quién lo consultó y cuándo). */
router.get('/reporte/:id/ejecuciones', requireAuditor, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('top', sql.Int, Math.min(Number(req.query.top) || 100, 500))
    // La identidad se lee de la propia fila: UsuarioAppId es NULL para quien no
    // tiene rol asignado, y ese JOIN dejaba la columna "usuario" vacía.
    .query(`SELECT TOP (@top) e.EjecucionId, e.FechaEjecucion, e.DuracionMs,
                   e.FilasResultado, e.Estado, e.MensajeError, e.ParametrosJson,
                   ISNULL(e.LoginICG, ua.LoginICG) AS LoginICG,
                   ISNULL(e.CodUsuarioICG, ua.CodUsuarioICG) AS CodUsuarioICG
            FROM rep.EjecucionLog e
            LEFT JOIN rep.UsuarioApp ua ON ua.UsuarioAppId = e.UsuarioAppId
            WHERE e.ReporteId = @id
            ORDER BY e.FechaEjecucion DESC`);
  res.json(recordset);
}));

module.exports = router;
