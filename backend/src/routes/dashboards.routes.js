'use strict';
const express = require('express');
const catalogo = require('../services/catalogoService');
const dashboards = require('../services/dashboardService');
const { auditoria } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

/** Autogestión: permiso propio, independiente del editor de T-SQL. */
function requireAutogestion(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !(rol.PuedeCrearDashboards || rol.PuedeAdministrar)) {
    return res.status(403).json({ error: 'Sin permiso para crear dashboards' });
  }
  next();
}
const esAdmin = (req) => !!req.session.user?.appRol?.PuedeAdministrar;

/** Catálogo de orígenes disponibles para construir dashboards. */
router.get('/catalogo', requireAuth, asyncH(async (req, res) => {
  res.json(await catalogo.paraUI());
}));

/** Ejecuta una consulta semántica (sin guardar nada). */
router.post('/consultar', requireAuth, asyncH(async (req, res) => {
  const seleccion = {
    codEmpresa: req.body.codEmpresa != null ? Number(req.body.codEmpresa) : undefined,
    ejercicio: req.body.ejercicio != null ? Number(req.body.ejercicio) : undefined
  };
  const out = await catalogo.consultar(
    req.body.consulta || req.body, req.session.user, req.session.empresaGestion, seleccion);
  res.json(out);
}));

/** Valores distintos de una dimensión, para poblar los filtros. */
router.post('/valores', requireAuth, asyncH(async (req, res) => {
  const out = await catalogo.valoresDe(
    req.body.campo, req.session.user, req.session.empresaGestion, {});
  res.json(out.rows.map(r => Object.values(r)[0]));
}));

// ---- Dashboards guardados ----
router.get('/', requireAuth, asyncH(async (req, res) => {
  res.json(await dashboards.listarVisibles(req.session.user.codUsuario, esAdmin(req)));
}));

router.get('/:id', requireAuth, asyncH(async (req, res) => {
  const d = await dashboards.obtener(Number(req.params.id), req.session.user.codUsuario, esAdmin(req));
  if (!d) return res.status(404).json({ error: 'Dashboard no encontrado' });
  res.json(d);
}));

router.post('/', requireAutogestion, asyncH(async (req, res) => {
  const id = await dashboards.crear(req.body, req.session.user);
  await auditoria.registrar({
    tipo: 'DASHBOARD_CREAR', entidad: 'DASHBOARD', entidadId: id, usuario: req.session.user,
    descripcion: `Creó el dashboard "${req.body.nombre}"`
  });
  res.status(201).json({ DashboardId: id });
}));

router.put('/:id', requireAutogestion, asyncH(async (req, res) => {
  await dashboards.actualizar(Number(req.params.id), req.body, req.session.user, esAdmin(req));
  await auditoria.registrar({
    tipo: 'DASHBOARD_CAMBIAR', entidad: 'DASHBOARD', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: `Actualizó el dashboard "${req.body.nombre ?? ''}"`
  });
  res.json({ ok: true });
}));

router.delete('/:id', requireAutogestion, asyncH(async (req, res) => {
  await dashboards.eliminar(Number(req.params.id), req.session.user, esAdmin(req));
  await auditoria.registrar({
    tipo: 'DASHBOARD_ELIMINAR', entidad: 'DASHBOARD', entidadId: Number(req.params.id),
    usuario: req.session.user, descripcion: 'Eliminó un dashboard'
  });
  res.json({ ok: true });
}));

router.put('/:id/compartir', requireAutogestion, asyncH(async (req, res) => {
  await dashboards.compartir(Number(req.params.id), req.body, req.session.user, esAdmin(req));
  await auditoria.registrar({
    tipo: 'DASHBOARD_COMPARTIR', entidad: 'DASHBOARD', entidadId: Number(req.params.id),
    usuario: req.session.user,
    descripcion: `Compartió un dashboard con ${(req.body.perfiles || []).length} perfil(es) y ` +
                 `${(req.body.usuarios || []).length} usuario(s)`
  });
  res.json({ ok: true });
}));

module.exports = router;
