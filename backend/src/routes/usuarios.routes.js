'use strict';
const express = require('express');
const usuarios = require('../services/usuarioService');
const { auditoria } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

/** Administrar usuarios exige el permiso propio, no basta con crear reportes. */
function requireAdmin(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !rol.PuedeAdministrar) {
    return res.status(403).json({ error: 'Requiere permiso de administración' });
  }
  next();
}

/** Usuarios de ICG con su rol en la aplicación. */
router.get('/', requireAdmin, asyncH(async (req, res) => {
  res.json(await usuarios.listarUsuarios({
    soloAsignados: req.query.soloAsignados === 'true',
    filtro: req.query.filtro || ''
  }));
}));

/** Roles disponibles. Accesible a cualquier autenticado (la UI los muestra). */
router.get('/roles', requireAuth, asyncH(async (req, res) => {
  res.json(await usuarios.listarRoles());
}));

/** Asigna o cambia el rol de un usuario. */
router.put('/:cod/rol', requireAdmin, asyncH(async (req, res) => {
  const cod = Number(req.params.cod);
  const r = await usuarios.asignarRol(
    { codUsuarioICG: cod, login: req.body.login, appRolId: Number(req.body.appRolId) },
    req.session.user);
  await auditoria.registrar({
    tipo: 'USUARIO_ROL', entidad: 'USUARIO', entidadId: cod, usuario: req.session.user,
    descripcion: `Asignó el rol "${r.rol}" a ${req.body.login || cod}`,
    detalle: { codUsuarioICG: cod, rol: r.rol }
  });
  res.json(r);
}));

/** Activa o desactiva el acceso de un usuario. */
router.put('/:cod/activo', requireAdmin, asyncH(async (req, res) => {
  const cod = Number(req.params.cod);
  await usuarios.cambiarActivo(cod, !!req.body.Activo, req.session.user);
  await auditoria.registrar({
    tipo: 'USUARIO_ROL', entidad: 'USUARIO', entidadId: cod, usuario: req.session.user,
    descripcion: `${req.body.Activo ? 'Activó' : 'Desactivó'} el acceso del usuario ${cod}`
  });
  res.json({ ok: true });
}));

/** Quita la asignación: el usuario vuelve a 'Lectura' por defecto. */
router.delete('/:cod', requireAdmin, asyncH(async (req, res) => {
  const cod = Number(req.params.cod);
  await usuarios.quitarRol(cod, req.session.user);
  await auditoria.registrar({
    tipo: 'USUARIO_ROL', entidad: 'USUARIO', entidadId: cod, usuario: req.session.user,
    descripcion: `Quitó el rol asignado al usuario ${cod}`
  });
  res.json({ ok: true });
}));

/** Historial de cambios de rol. */
router.get('/historial', requireAdmin, asyncH(async (req, res) => {
  res.json(await usuarios.historial(
    req.query.cod ? Number(req.query.cod) : null, req.query.top));
}));

module.exports = router;
