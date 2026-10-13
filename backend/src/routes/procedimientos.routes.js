'use strict';
const express = require('express');
const procedimientos = require('../services/procedimientoService');
const { authService } = require('../services/authService');
const { auditoria } = require('../services/auditoriaService');
const { asyncH } = require('../middleware/auth');

const router = express.Router();

/**
 * Todo el módulo es solo para administradores: muestra el código fuente de los
 * SP/vistas del ERP y puede aplicarles ALTER.
 */
router.use((req, res, next) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'No autenticado' });
  if (!req.session.user.appRol?.PuedeAdministrar) {
    return res.status(403).json({ error: 'El módulo Procedimientos es solo para administradores' });
  }
  next();
});

async function getEmpresaDestino(req) {
  const g = req.session.empresaGestion;
  if (!g) { const e = new Error('Seleccione una empresa primero'); e.status = 400; throw e; }
  return authService.assertEmpresaPermitida(req.session.user.codUsuario, 'GESTION', g.codEmpresa);
}

/** Lista SPs de la BD de la empresa activa. */
router.get('/empresa/sps', asyncH(async (req, res) => {
  const emp = await getEmpresaDestino(req);
  res.json(await procedimientos.descubrirEnBaseDatos(
    { servidor: emp.servidor, baseDatos: emp.baseDatos }, req.query.filtro));
}));

/** Lista Vistas de la BD de la empresa activa. */
router.get('/empresa/vistas', asyncH(async (req, res) => {
  const emp = await getEmpresaDestino(req);
  res.json(await procedimientos.listarVistasEmpresa(
    { servidor: emp.servidor, baseDatos: emp.baseDatos }, req.query.filtro));
}));

/** Obtiene la definición (código fuente) de un SP o Vista. */
router.get('/empresa/definicion', asyncH(async (req, res) => {
  const emp = await getEmpresaDestino(req);
  const def = await procedimientos.getDefinicion(
    { servidor: emp.servidor, baseDatos: emp.baseDatos },
    req.query.esquema || 'dbo', req.query.nombre);
  res.json({ definition: def });
}));

/** Aplica un ALTER PROCEDURE / ALTER VIEW / ALTER FUNCTION en la BD de la empresa activa. */
router.put('/empresa/alterar', asyncH(async (req, res) => {
  const emp = await getEmpresaDestino(req);
  await procedimientos.alterarDefinicion(
    { servidor: emp.servidor, baseDatos: emp.baseDatos }, req.body.definicion);
  await auditoria.registrar({
    tipo: 'SP_ALTERAR', entidad: 'PROCEDIMIENTO', entidadId: null,
    usuario: req.session.user,
    descripcion: `Alteró definición en ${emp.baseDatos}`,
    detalle: { preview: (req.body.definicion || '').slice(0, 100) }
  });
  res.json({ ok: true });
}));

module.exports = router;
