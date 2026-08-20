'use strict';
const express = require('express');
const sql = require('mssql');
const cm = require('../db/connectionManager');
const { requireAuth, asyncH } = require('../middleware/auth');
const { proximaEjecucion, validarCron } = require('../services/cronUtil');
const { auditoria, EVENTO } = require('../services/auditoriaService');

const router = express.Router();

const ipDe = (req) =>
  (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim() || null;

/** Exige privilegio de programar envíos automáticos. */
function requireProgramar(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !rol.PuedeProgramar) {
    return res.status(403).json({ error: 'Sin permiso para programar envíos' });
  }
  next();
}

// Listar programaciones (con el nombre del reporte).
router.get('/', requireAuth, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request().query(
    `SELECT p.ProgramacionId, p.ReporteId, r.Nombre AS ReporteNombre, p.Nombre,
            p.CronExpresion, p.FormatoExportacion, p.Destinatarios, p.Activo,
            p.ProximaEjecucion, p.UltimaEjecucion
     FROM rep.Programacion p
     JOIN rep.Reporte r ON r.ReporteId = p.ReporteId
     ORDER BY p.Nombre`);
  res.json(recordset);
}));

// Crear programación.
router.post('/', requireProgramar, asyncH(async (req, res) => {
  const b = req.body;
  const chk = validarCron(b.CronExpresion || '');
  if (!chk.valida) return res.status(400).json({ error: `Cron inválido: ${chk.error}` });
  if (!b.Destinatarios) return res.status(400).json({ error: 'Destinatarios requerido' });

  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('rid', sql.Int, b.ReporteId)
    .input('nom', sql.NVarChar(120), b.Nombre)
    .input('cron', sql.NVarChar(60), b.CronExpresion)
    .input('fmt', sql.VarChar(6), (b.FormatoExportacion || 'EXCEL').toUpperCase())
    .input('eid', sql.Int, b.EmpresaId ?? null)
    .input('par', sql.NVarChar(sql.MAX), b.Parametros ? JSON.stringify(b.Parametros) : null)
    .input('dest', sql.NVarChar(sql.MAX), b.Destinatarios)
    .input('asu', sql.NVarChar(200), b.Asunto ?? null)
    .input('cue', sql.NVarChar(sql.MAX), b.Cuerpo ?? null)
    .input('cc', sql.Int, b.CorreoConfigId ?? null)
    .input('creado', sql.Int, req.session.user.appRol?.UsuarioAppId ?? null)
    .input('prox', sql.DateTime2, proximaEjecucion(b.CronExpresion))
    .query(`INSERT INTO rep.Programacion
            (ReporteId,Nombre,CronExpresion,FormatoExportacion,EmpresaId,ParametrosJson,
             Destinatarios,Asunto,Cuerpo,CorreoConfigId,CreadoPor,ProximaEjecucion)
            OUTPUT inserted.ProgramacionId
            VALUES (@rid,@nom,@cron,@fmt,@eid,@par,@dest,@asu,@cue,@cc,@creado,@prox)`);
  const pid = recordset[0].ProgramacionId;
  await auditoria.registrar({
    tipo: EVENTO.PROGRAMACION_CREAR, entidad: 'PROGRAMACION', entidadId: pid,
    usuario: req.session.user,
    descripcion: `Creó la programación "${b.Nombre}" (${b.CronExpresion})`,
    ip: ipDe(req)
  });
  res.status(201).json({ ProgramacionId: pid });
}));

// Activar / desactivar.
router.put('/:id/activo', requireProgramar, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const activo = !!req.body.Activo;
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('a', sql.Bit, activo)
    .query(`UPDATE rep.Programacion SET Activo = @a WHERE ProgramacionId = @id`);
  await auditoria.registrar({
    tipo: EVENTO.PROGRAMACION_CAMBIAR, entidad: 'PROGRAMACION', entidadId: Number(req.params.id),
    usuario: req.session.user,
    descripcion: `${activo ? 'Activó' : 'Desactivó'} la programación #${req.params.id}`,
    ip: ipDe(req)
  });
  res.json({ ok: true });
}));

router.delete('/:id', requireProgramar, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await cm.getConfigPool();
  // Captura nombre antes de borrar para el log
  const { recordset: prev } = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT Nombre FROM rep.Programacion WHERE ProgramacionId = @id`);
  await pool.request().input('id', sql.Int, id)
    .query(`DELETE FROM rep.Programacion WHERE ProgramacionId = @id`);
  await auditoria.registrar({
    tipo: EVENTO.PROGRAMACION_ELIMINAR, entidad: 'PROGRAMACION', entidadId: id,
    usuario: req.session.user,
    descripcion: `Eliminó la programación "${prev[0]?.Nombre ?? id}"`,
    ip: ipDe(req)
  });
  res.json({ ok: true });
}));

/** Encola una corrida inmediata (botón "Ejecutar ahora"). */
router.post('/:id/ejecutar-ahora', requireProgramar, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('id', sql.Int, req.params.id)
    .query(`INSERT INTO rep.JobCola (ProgramacionId, Estado, ProgramadoPara)
            OUTPUT inserted.JobId
            VALUES (@id, 'PENDIENTE', SYSDATETIME())`);
  res.status(202).json({ JobId: recordset[0].JobId });
}));

/** Vista previa: valida el cron y devuelve las próximas N corridas. */
router.post('/validar-cron', requireAuth, (req, res) => {
  const expr = req.body.CronExpresion || '';
  const chk = validarCron(expr);
  if (!chk.valida) return res.status(400).json({ valida: false, error: chk.error });
  const proximas = [];
  let desde = new Date();
  for (let i = 0; i < 5; i++) { desde = proximaEjecucion(expr, desde); proximas.push(desde); }
  res.json({ valida: true, proximas });
});

/** Historial de envíos (manual y programado). */
router.get('/historial', requireAuth, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('top', sql.Int, Math.min(Number(req.query.top) || 100, 500))
    .query(`SELECT TOP (@top) h.EnvioId, h.ReporteId, r.Nombre AS ReporteNombre,
                   h.Origen, h.Destinatarios, h.FormatoAdjunto, h.Estado,
                   h.MensajeError, h.FilasResultado, h.FechaEnvio
            FROM rep.EnvioCorreoHistorial h
            JOIN rep.Reporte r ON r.ReporteId = h.ReporteId
            ORDER BY h.FechaEnvio DESC`);
  res.json(recordset);
}));

module.exports = router;
