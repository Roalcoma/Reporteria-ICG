'use strict';
const express = require('express');
const { checkVersion, descargarYExtraer } = require('../services/actualizacionService');
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
  res.json(await checkVersion());
}));

/** Descarga y aplica la actualización. Solo administradores. */
router.post('/aplicar', requireAdmin, asyncH(async (req, res) => {
  const { urlZip } = req.body;
  if (!urlZip) return res.status(400).json({ error: 'urlZip es requerido' });
  res.json(await descargarYExtraer(urlZip));
}));

module.exports = router;
