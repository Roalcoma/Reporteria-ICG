'use strict';
const express = require('express');
const actualizacion = require('../services/actualizacionService');
const { auditoria } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !rol.PuedeAdministrar) {
    return res.status(403).json({ error: 'Requiere permiso de administración' });
  }
  next();
}

/** Consulta la versión remota en GitHub. Accesible a cualquier usuario autenticado. */
router.get('/check', requireAuth, asyncH(async (req, res) => {
  res.json(await actualizacion.checkVersion());
}));

/** Inicia la actualización en segundo plano (202). El progreso se consulta en /estado. */
router.post('/aplicar', requireAdmin, asyncH(async (req, res) => {
  const p = await actualizacion.iniciar();
  await auditoria.registrar({
    tipo: 'ACTUALIZACION', entidad: 'SISTEMA', usuario: req.session.user,
    descripcion: `Inició la actualización a ${p.version}`
  });
  res.status(202).json(p);
}));

router.get('/estado', requireAdmin, (req, res) => res.json(actualizacion.progreso()));

module.exports = router;
