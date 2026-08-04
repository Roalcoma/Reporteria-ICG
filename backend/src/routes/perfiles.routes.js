'use strict';
const express = require('express');
const perfiles = require('../services/perfilService');
const { auditoria } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

/** Los perfiles definen qué ve cada usuario: los administra quien administra usuarios. */
function requireAdmin(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !rol.PuedeAdministrar) {
    return res.status(403).json({ error: 'Requiere permiso de administración' });
  }
  next();
}

router.get('/', requireAuth, asyncH(async (req, res) => {
  res.json(await perfiles.listar());
}));

router.get('/:id', requireAdmin, asyncH(async (req, res) => {
  const p = await perfiles.obtener(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Perfil no encontrado' });
  res.json(p);
}));

router.post('/', requireAdmin, asyncH(async (req, res) => {
  const id = await perfiles.crear(req.body, req.session.user);
  await auditoria.registrar({
    tipo: 'PERFIL_CREAR', entidad: 'PERFIL', entidadId: id, usuario: req.session.user,
    descripcion: `Creó el perfil "${req.body.nombre}"`
  });
  res.status(201).json({ PerfilId: id });
}));

router.put('/:id', requireAdmin, asyncH(async (req, res) => {
  await perfiles.actualizar(Number(req.params.id), req.body);
  await auditoria.registrar({
    tipo: 'PERFIL_CAMBIAR', entidad: 'PERFIL', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: `Actualizó el perfil "${req.body.nombre}"`
  });
  res.json({ ok: true });
}));

router.delete('/:id', requireAdmin, asyncH(async (req, res) => {
  await perfiles.eliminar(Number(req.params.id));
  await auditoria.registrar({
    tipo: 'PERFIL_ELIMINAR', entidad: 'PERFIL', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: 'Eliminó un perfil de reportes'
  });
  res.json({ ok: true });
}));

/** Define el conjunto de reportes del perfil (alcanza a todos sus usuarios). */
router.put('/:id/reportes', requireAdmin, asyncH(async (req, res) => {
  const ids = (req.body.reporteIds || []).map(Number);
  await perfiles.setReportes(Number(req.params.id), ids);
  await auditoria.registrar({
    tipo: 'PERFIL_CAMBIAR', entidad: 'PERFIL', entidadId: Number(req.params.id),
    usuario: req.session.user,
    descripcion: `Definió ${ids.length} reporte(s) en el perfil`,
    detalle: { reporteIds: ids }
  });
  res.json({ ok: true });
}));

/** Perfiles asignados a un usuario. */
router.get('/usuario/:cod', requireAdmin, asyncH(async (req, res) => {
  res.json(await perfiles.getPerfilesDeUsuario(Number(req.params.cod)));
}));

router.put('/usuario/:cod', requireAdmin, asyncH(async (req, res) => {
  const ids = (req.body.perfilIds || []).map(Number);
  await perfiles.setPerfilesDeUsuario(
    Number(req.params.cod), ids, req.body.login, req.session.user);
  await auditoria.registrar({
    tipo: 'USUARIO_PERFIL', entidad: 'USUARIO', entidadId: Number(req.params.cod),
    usuario: req.session.user,
    descripcion: `Asignó ${ids.length} perfil(es) a ${req.body.login || req.params.cod}`,
    detalle: { perfilIds: ids }
  });
  res.json({ ok: true });
}));

module.exports = router;
