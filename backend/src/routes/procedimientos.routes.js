'use strict';
const express = require('express');
const procedimientos = require('../services/procedimientoService');
const { authService } = require('../services/authService');
const { auditoria, EVENTO } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

/**
 * Autorizar procedimientos es una acción sensible: se exige el privilegio de
 * creación (rol Creador/Editor). No basta con poder ejecutar reportes.
 */
function requireAdminSp(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !rol.PuedeCrear) {
    return res.status(403).json({ error: 'Sin permiso para administrar procedimientos' });
  }
  next();
}

/** Lista los SP autorizados. Cualquier usuario autenticado puede consultarla. */
router.get('/', requireAuth, asyncH(async (req, res) => {
  res.json(await procedimientos.listar());
}));

/** Descubre los SP existentes en la BD de la empresa activa (para elegir cuál autorizar). */
router.get('/descubrir', requireAdminSp, asyncH(async (req, res) => {
  const g = req.session.empresaGestion;
  if (!g) return res.status(400).json({ error: 'Seleccione una empresa primero' });
  const emp = await authService.assertEmpresaPermitida(
    req.session.user.codUsuario, 'GESTION', g.codEmpresa);
  res.json(await procedimientos.descubrirEnBaseDatos(
    { servidor: emp.servidor, baseDatos: emp.baseDatos }, req.query.filtro));
}));

/** Autoriza un procedimiento. */
router.post('/', requireAdminSp, asyncH(async (req, res) => {
  const id = await procedimientos.autorizar(req.body, req.session.user);
  await auditoria.registrar({
    tipo: 'SP_AUTORIZAR', entidad: 'PROCEDIMIENTO', entidadId: id, usuario: req.session.user,
    descripcion: `Autorizó el procedimiento ${req.body.esquema || 'dbo'}.${req.body.nombre}`,
    detalle: req.body
  });
  res.status(201).json({ ProcedimientoId: id });
}));

/** Activa o desactiva un procedimiento autorizado. */
router.put('/:id/activo', requireAdminSp, asyncH(async (req, res) => {
  await procedimientos.cambiarActivo(Number(req.params.id), req.body.Activo);
  await auditoria.registrar({
    tipo: 'SP_CAMBIAR', entidad: 'PROCEDIMIENTO', entidadId: Number(req.params.id),
    usuario: req.session.user,
    descripcion: `${req.body.Activo ? 'Activó' : 'Desactivó'} un procedimiento autorizado`
  });
  res.json({ ok: true });
}));

/** Revoca la autorización. */
router.delete('/:id', requireAdminSp, asyncH(async (req, res) => {
  await procedimientos.eliminar(Number(req.params.id));
  await auditoria.registrar({
    tipo: 'SP_REVOCAR', entidad: 'PROCEDIMIENTO', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: 'Revocó la autorización de un procedimiento'
  });
  res.json({ ok: true });
}));

module.exports = router;
