'use strict';
const express = require('express');
const branding = require('../services/brandingService');
const { authService } = require('../services/authService');
const { auditoria } = require('../services/auditoriaService');
const { requireAuth, asyncH } = require('../middleware/auth');

const router = express.Router();

/** Configurar la identidad corporativa es tarea de un Creador/Editor. */
function requireAdminBranding(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !(rol.PuedeCrear || rol.PuedeEditar)) {
    return res.status(403).json({ error: 'Sin permiso para configurar el branding' });
  }
  next();
}

/** Normaliza y valida los parámetros de identificación de la empresa. */
function contexto(src) {
  const tipo = String(src.tipo || 'GESTION').toUpperCase();
  if (!['GESTION', 'CONTABLE'].includes(tipo)) {
    const e = new Error('Tipo de empresa inválido'); e.status = 400; throw e;
  }
  const codigoICG = Number(src.codigoICG ?? src.codEmpresa);
  if (!Number.isInteger(codigoICG)) {
    const e = new Error('Código de empresa inválido'); e.status = 400; throw e;
  }
  const ejercicio = src.ejercicio != null && src.ejercicio !== ''
    ? Number(src.ejercicio) : null;
  return { tipo, codigoICG, ejercicio };
}

/** Empresas con branding ya configurado. */
router.get('/', requireAuth, asyncH(async (req, res) => {
  res.json(await branding.listar());
}));

/** Branding de una empresa concreta (para editar o previsualizar). */
router.get('/empresa', requireAuth, asyncH(async (req, res) => {
  const { tipo, codigoICG, ejercicio } = contexto(req.query);
  res.json(await branding.getParaEditar(codigoICG, tipo, ejercicio));
}));

/** Crea o actualiza el branding. El logo viaja como data URI en el JSON. */
router.put('/empresa', requireAdminBranding, asyncH(async (req, res) => {
  const { tipo, codigoICG, ejercicio } = contexto(req.body);

  // Solo se permite configurar empresas a las que el usuario tiene acceso en ICG.
  const emp = await authService.assertEmpresaPermitida(
    req.session.user.codUsuario, tipo, codigoICG, ejercicio);

  await branding.guardar({
    codigoICG, tipo, ejercicio, nombre: emp.nombre,
    logoDataUri: req.body.logoDataUri,
    encabezadoHtml: req.body.encabezadoHtml,
    pieHtml: req.body.pieHtml
  });
  await auditoria.registrar({
    tipo: 'BRANDING_GUARDAR', entidad: 'EMPRESA', entidadId: codigoICG,
    usuario: req.session.user, empresaCod: codigoICG, ejercicio,
    descripcion: `Actualizó el branding de ${emp.nombre || codigoICG}`,
    detalle: { tipo, cambioLogo: !!req.body.logoDataUri }
  });
  res.json({ ok: true });
}));

/** Elimina solo el logo (conserva encabezado y pie). */
router.delete('/empresa/logo', requireAdminBranding, asyncH(async (req, res) => {
  const { tipo, codigoICG, ejercicio } = contexto(req.query);
  await authService.assertEmpresaPermitida(
    req.session.user.codUsuario, tipo, codigoICG, ejercicio);
  await branding.eliminarLogo(codigoICG, tipo, ejercicio);
  await auditoria.registrar({
    tipo: 'BRANDING_GUARDAR', entidad: 'EMPRESA', entidadId: codigoICG,
    usuario: req.session.user, empresaCod: codigoICG,
    descripcion: 'Eliminó el logo de la empresa'
  });
  res.json({ ok: true });
}));

module.exports = router;
