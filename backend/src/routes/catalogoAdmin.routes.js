'use strict';
const express = require('express');
const admin = require('../services/catalogoAdminService');
const { auditoria } = require('../services/auditoriaService');
const { asyncH } = require('../middleware/auth');
const cfg = require('../config');

const router = express.Router();

/**
 * El catálogo solo lo administra el SUPERVISOR de ICG (CODUSUARIO = 0).
 * Un origen mal definido afecta a todos los dashboards que lo usan y su SQL
 * corre sobre las bases de ICG, así que la puerta es deliberadamente estrecha.
 * La lista es configurable por si una instalación usa otro código.
 */
function requireSupervisor(req, res, next) {
  const u = req.session.user;
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  if (!cfg.catalogoAdmins.includes(Number(u.codUsuario))) {
    return res.status(403).json({
      error: 'Solo el usuario SUPERVISOR de ICG puede administrar los orígenes de datos.'
    });
  }
  next();
}

/** Orígenes con su propiedad (base o propio) y su uso. */
router.get('/origenes', requireSupervisor, asyncH(async (req, res) => {
  res.json(await admin.listar());
}));

router.get('/origenes/:id', requireSupervisor, asyncH(async (req, res) => {
  const d = await admin.obtener(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Origen no encontrado' });
  res.json(d);
}));

/** Previsualiza el SQL: valida, ejecuta TOP 20 y propone los campos. */
router.post('/origenes/probar', requireSupervisor, asyncH(async (req, res) => {
  res.json(await admin.probar(
    req.body.sqlBase, req.session.user, req.session.empresaGestion, req.body.area));
}));

router.post('/origenes', requireSupervisor, asyncH(async (req, res) => {
  const id = await admin.crear(req.body, req.session.user);
  await auditoria.registrar({
    tipo: 'CATALOGO_CREAR', entidad: 'ORIGEN', entidadId: id, usuario: req.session.user,
    descripcion: `Creó el origen de datos "${req.body.clave}"`
  });
  res.status(201).json({ OrigenId: id });
}));

router.put('/origenes/:id', requireSupervisor, asyncH(async (req, res) => {
  await admin.actualizar(Number(req.params.id), req.body, req.session.user);
  await auditoria.registrar({
    tipo: 'CATALOGO_CAMBIAR', entidad: 'ORIGEN', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: `Actualizó el origen "${req.body.clave ?? ''}"`
  });
  res.json({ ok: true });
}));

/** Duplica un origen (por ejemplo uno base) para poder personalizarlo. */
router.post('/origenes/:id/duplicar', requireSupervisor, asyncH(async (req, res) => {
  const id = await admin.duplicar(Number(req.params.id), req.body, req.session.user);
  await auditoria.registrar({
    tipo: 'CATALOGO_CREAR', entidad: 'ORIGEN', entidadId: id, usuario: req.session.user,
    descripcion: `Duplicó un origen del catálogo como "${req.body.clave ?? 'copia'}"`
  });
  res.status(201).json({ OrigenId: id });
}));

router.delete('/origenes/:id', requireSupervisor, asyncH(async (req, res) => {
  await admin.eliminar(Number(req.params.id), { forzar: req.query.forzar === 'true' });
  await auditoria.registrar({
    tipo: 'CATALOGO_ELIMINAR', entidad: 'ORIGEN', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: 'Eliminó un origen de datos propio'
  });
  res.json({ ok: true });
}));

// ---- Relaciones ----
router.post('/relaciones', requireSupervisor, asyncH(async (req, res) => {
  await admin.crearRelacion(req.body);
  await auditoria.registrar({
    tipo: 'CATALOGO_CAMBIAR', entidad: 'ORIGEN', usuario: req.session.user,
    descripcion: `Relacionó ${req.body.origenIzq}.${req.body.campoIzq} con ` +
                 `${req.body.origenDer}.${req.body.campoDer}`
  });
  res.status(201).json({ ok: true });
}));

router.delete('/relaciones/:id', requireSupervisor, asyncH(async (req, res) => {
  await admin.eliminarRelacion(Number(req.params.id));
  res.json({ ok: true });
}));

module.exports = router;
