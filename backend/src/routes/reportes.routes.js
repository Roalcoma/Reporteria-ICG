'use strict';
const express = require('express');
const repo = require('../services/reporteRepository');
const reporteService = require('../services/reporteService');
const exportService = require('../services/exportService');
const mailService = require('../services/mailService');
const brandingService = require('../services/brandingService');
const portabilidad = require('../services/portabilidadService');
const versionService = require('../services/versionService');
const perfiles = require('../services/perfilService');
const { auditoria, EVENTO } = require('../services/auditoriaService');
const { requireAuth, requireEditor, asyncH } = require('../middleware/auth');

const router = express.Router();

/** IP del cliente para la bitácora. */
const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
  .toString().split(',')[0].trim() || null;

/** Normaliza el cuerpo de ejecución: { seleccion:{codEmpresa,ejercicio}, parametros:{} } */
function contextoEjecucion(body) {
  return {
    seleccion: {
      codEmpresa: body.codEmpresa != null ? Number(body.codEmpresa) : undefined,
      ejercicio: body.ejercicio != null ? Number(body.ejercicio) : undefined
    },
    parametros: body.parametros || {}
  };
}

// ---- Lectura / CRUD de definiciones ----
router.get('/', requireAuth, asyncH(async (req, res) => {
  const carpetaId = req.query.carpetaId != null ? Number(req.query.carpetaId) : null;
  const lista = await repo.listReportes(carpetaId);

  // Visibilidad por perfil: null = ve todos (administrador o sin perfiles).
  const visibles = await perfiles.getReportesVisibles(
    req.session.user.codUsuario, !!req.session.user.appRol?.PuedeAdministrar);
  res.json(visibles ? lista.filter(r => visibles.has(r.ReporteId)) : lista);
}));

/** Duplica un reporte con toda su definición (consultas, parámetros y columnas). */
router.post('/:id/duplicar', requireEditor, asyncH(async (req, res) => {
  const u = req.session.user;
  const origen = Number(req.params.id);
  const def = await repo.getReporteFull(origen);
  if (!def) return res.status(404).json({ error: 'Reporte no encontrado' });

  const copia = {
    reporte: {
      ...def.reporte,
      Nombre: req.body.nombre || `${def.reporte.Nombre} (copia)`,
      CarpetaId: req.body.carpetaId !== undefined ? req.body.carpetaId : def.reporte.CarpetaId
    },
    consultas: def.consultas,
    parametros: def.parametros,
    columnas: def.columnas
  };
  const id = await repo.crearReporte(copia, u.appRol?.UsuarioAppId);

  await versionService.guardar({
    reporteId: id, version: 1, accion: 'CREAR', definicion: copia,
    nombreReporte: copia.reporte.Nombre,
    comentario: `Duplicado del reporte ${origen}`, usuario: u
  });
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_CREAR, entidad: 'REPORTE', entidadId: id, usuario: u,
    descripcion: `Duplicó "${def.reporte.Nombre}" como "${copia.reporte.Nombre}"`,
    detalle: { origen }, ip: ipDe(req)
  });
  res.status(201).json({ ReporteId: id, Nombre: copia.reporte.Nombre });
}));

router.get('/:id', requireAuth, asyncH(async (req, res) => {
  const def = await repo.getReporteFull(Number(req.params.id));
  if (!def) return res.status(404).json({ error: 'Reporte no encontrado' });
  res.json(def);
}));

router.post('/', requireEditor, asyncH(async (req, res) => {
  const u = req.session.user;
  const uid = u.appRol?.UsuarioAppId;
  const id = await repo.crearReporte(req.body, uid);

  await versionService.guardar({
    reporteId: id, version: 1, accion: 'CREAR', definicion: req.body,
    nombreReporte: req.body.reporte?.Nombre, comentario: req.body.comentario, usuario: u
  });
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_CREAR, entidad: 'REPORTE', entidadId: id, usuario: u,
    descripcion: `Creó el reporte "${req.body.reporte?.Nombre}"`, ip: ipDe(req)
  });
  res.status(201).json({ ReporteId: id });
}));

router.put('/:id', requireEditor, asyncH(async (req, res) => {
  const u = req.session.user;
  const id = Number(req.params.id);
  // Snapshot del estado ANTERIOR para poder reconstruir la evolución completa.
  const previo = await repo.getReporteFull(id);
  await repo.actualizarReporte(id, req.body, u.appRol?.UsuarioAppId);

  await versionService.guardar({
    reporteId: id, version: (previo?.reporte?.Version ?? 0) + 1, accion: 'MODIFICAR',
    definicion: req.body, nombreReporte: req.body.reporte?.Nombre,
    comentario: req.body.comentario, usuario: u
  });
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_MODIFICAR, entidad: 'REPORTE', entidadId: id, usuario: u,
    descripcion: `Modificó el reporte "${req.body.reporte?.Nombre}"`, ip: ipDe(req)
  });
  res.json({ ok: true });
}));

router.delete('/:id', requireEditor, asyncH(async (req, res) => {
  const u = req.session.user;
  const id = Number(req.params.id);
  // Se conserva la definición borrada para poder auditarla o restaurarla.
  const previo = await repo.getReporteFull(id);
  await repo.eliminarReporte(id);

  await versionService.guardar({
    reporteId: id, version: (previo?.reporte?.Version ?? 0) + 1, accion: 'ELIMINAR',
    definicion: previo || {}, nombreReporte: previo?.reporte?.Nombre, usuario: u
  });
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_ELIMINAR, entidad: 'REPORTE', entidadId: id, usuario: u,
    descripcion: `Eliminó el reporte "${previo?.reporte?.Nombre ?? id}"`, ip: ipDe(req)
  });
  res.json({ ok: true });
}));

// ---- Evolución / versiones ----
router.get('/:id/versiones', requireAuth, asyncH(async (req, res) => {
  res.json(await versionService.historial(Number(req.params.id)));
}));

router.get('/versiones/:versionId', requireAuth, asyncH(async (req, res) => {
  const v = await versionService.obtener(Number(req.params.versionId));
  if (!v) return res.status(404).json({ error: 'Versión no encontrada' });
  res.json(v);
}));

router.get('/versiones/:a/comparar/:b', requireAuth, asyncH(async (req, res) => {
  res.json(await versionService.comparar(Number(req.params.a), Number(req.params.b)));
}));

// ---- Opciones dinámicas de un parámetro LISTA_SQL ----
router.post('/:id/parametros/:paramId/opciones', requireAuth, asyncH(async (req, res) => {
  const { seleccion } = contextoEjecucion(req.body);
  const ops = await reporteService.getOpcionesDinamicas(
    Number(req.params.id), req.params.paramId, seleccion, req.session.user);
  res.json(ops);
}));

// ---- Ejecución ----
router.post('/:id/ejecutar', requireAuth, asyncH(async (req, res) => {
  const { seleccion, parametros } = contextoEjecucion(req.body);
  const id = Number(req.params.id);
  const t0 = Date.now();
  try {
    const out = await reporteService.ejecutar(id, seleccion, parametros,
      req.session.user, req.session.empresaGestion);
    await auditoria.registrar({
      tipo: EVENTO.REPORTE_EJECUTAR, entidad: 'REPORTE', entidadId: id,
      usuario: req.session.user, empresaCod: seleccion.codEmpresa, ejercicio: seleccion.ejercicio,
      descripcion: `Consultó "${out.reporte.Nombre}" (${out.rowCount} filas, ${Date.now() - t0} ms)`,
      detalle: { parametros, filas: out.rowCount, duracionMs: Date.now() - t0 }, ip: ipDe(req)
    });
    res.json(out);
  } catch (e) {
    // Un SQL rechazado por la guarda se registra aparte: es señal de seguridad.
    await auditoria.registrar({
      tipo: e.motivo ? EVENTO.SQL_RECHAZADO : EVENTO.REPORTE_EJECUTAR,
      entidad: 'REPORTE', entidadId: id, usuario: req.session.user, exitoso: false,
      descripcion: e.message, detalle: { parametros, motivo: e.motivo }, ip: ipDe(req)
    });
    throw e;
  }
}));

// ---- Exportación (CSV/EXCEL/JSON/XML/HTML) ----
router.post('/:id/exportar', requireAuth, asyncH(async (req, res) => {
  const formato = (req.body.formato || 'CSV').toUpperCase();
  const { seleccion, parametros } = contextoEjecucion(req.body);
  const out = await reporteService.ejecutar(Number(req.params.id), seleccion, parametros,
    req.session.user, req.session.empresaGestion);

  // La empresa efectiva viene del resultado: en reportes de GESTIÓN el cliente no
  // envía codEmpresa (se usa la de la sesión), así que leerlo de `seleccion` dejaba
  // los reportes de gestión sin branding.
  const conBranding = ['HTML', 'PDF'].includes(formato);
  const branding = conBranding && out.empresa?.codEmpresa != null
    ? await brandingService.getBranding(out.empresa.codEmpresa, out.reporte.Area, out.empresa.ejercicio)
    : null;

  const buffer = await exportService.exportar(formato, out.rows || out.cabecera || [], out.columnas, {
    titulo: out.reporte.Nombre,
    subtitulo: out.empresa?.nombre ? `Empresa: ${out.empresa.nombre}` : null,
    branding,
    // La orientación y la hoja vienen del reporte; el cliente puede cambiarlas
    // en esta exportación concreta sin alterar el valor por defecto.
    orientacion: req.body.orientacion || out.reporte.OrientacionPdf || 'VERTICAL',
    tamanoHoja: req.body.tamanoHoja || out.reporte.TamanoHoja || 'A4'
  });

  await auditoria.registrar({
    tipo: EVENTO.REPORTE_EXPORTAR, entidad: 'REPORTE', entidadId: Number(req.params.id),
    usuario: req.session.user, empresaCod: seleccion.codEmpresa, ejercicio: seleccion.ejercicio,
    descripcion: `Exportó "${out.reporte.Nombre}" a ${formato} (${out.rowCount} filas)`,
    detalle: { formato, filas: out.rowCount, parametros }, ip: ipDe(req)
  });

  const nombre = `${out.reporte.Nombre}.${exportService.extension(formato)}`.replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', exportService.contentType(formato));
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buffer);
}));

// ---- Envío por correo ad-hoc ----
router.post('/:id/enviar', requireAuth, asyncH(async (req, res) => {
  const formato = (req.body.formato || 'EXCEL').toUpperCase();
  const { seleccion, parametros } = contextoEjecucion(req.body);
  const { destinatarios, asunto, cuerpo } = req.body;
  if (!destinatarios) return res.status(400).json({ error: 'destinatarios requerido' });

  const out = await reporteService.ejecutar(Number(req.params.id), seleccion, parametros,
    req.session.user, req.session.empresaGestion);
  const branding = ['HTML', 'PDF'].includes(formato) && out.empresa?.codEmpresa != null
    ? await brandingService.getBranding(out.empresa.codEmpresa, out.reporte.Area, out.empresa.ejercicio)
    : null;
  const buffer = await exportService.exportar(formato, out.rows || out.cabecera || [], out.columnas, {
    titulo: out.reporte.Nombre,
    subtitulo: out.empresa?.nombre ? `Empresa: ${out.empresa.nombre}` : null,
    branding,
    orientacion: req.body.orientacion || out.reporte.OrientacionPdf || 'VERTICAL',
    tamanoHoja: req.body.tamanoHoja || out.reporte.TamanoHoja || 'A4'
  });

  await mailService.enviarReporte({
    reporteId: Number(req.params.id), origen: 'MANUAL',
    usuarioAppId: req.session.user.appRol?.UsuarioAppId,
    destinatarios, asunto: asunto || out.reporte.Nombre, cuerpo, formato,
    filas: out.rowCount, parametros,
    adjunto: {
      filename: `${out.reporte.Nombre}.${exportService.extension(formato)}`,
      content: buffer, contentType: exportService.contentType(formato)
    }
  });
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_ENVIAR, entidad: 'REPORTE', entidadId: Number(req.params.id),
    usuario: req.session.user, empresaCod: seleccion.codEmpresa, ejercicio: seleccion.ejercicio,
    descripcion: `Envió "${out.reporte.Nombre}" por correo a ${destinatarios}`,
    detalle: { formato, destinatarios, filas: out.rowCount }, ip: ipDe(req)
  });
  res.json({ ok: true });
}));

// ---- Portabilidad ----
router.get('/:id/definicion', requireEditor, asyncH(async (req, res) => {
  const bundle = await portabilidad.exportar(Number(req.params.id), req.session.user.appRol?.UsuarioAppId);
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_EXPORTAR_DEF, entidad: 'REPORTE', entidadId: Number(req.params.id),
    usuario: req.session.user,
    descripcion: `Exportó la definición de "${bundle.reporte.Nombre}" para portabilidad`,
    ip: ipDe(req)
  });
  // Nombre de archivo seguro: sin caracteres inválidos para el sistema de archivos.
  const archivo = `${bundle.reporte.Nombre}`.replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${archivo}.json"`);
  res.json(bundle);
}));

/**
 * Modo diseño: ejecuta una consulta para descubrir sus columnas y una muestra
 * de datos, sin necesidad de guardar el reporte.
 */
router.post('/columnas/descubrir', requireEditor, asyncH(async (req, res) => {
  const { seleccion, parametros } = contextoEjecucion(req.body);
  const out = await reporteService.descubrirColumnas({
    sqlText: req.body.sqlText,
    definiciones: req.body.definiciones || [],
    valores: parametros,
    area: (req.body.area || 'GESTION').toUpperCase(),
    seleccion
  }, req.session.user, req.session.empresaGestion);
  res.json(out);
}));

/** Revisa un bundle sin guardarlo (previsualización antes de importar). */
router.post('/definicion/analizar', requireEditor, asyncH(async (req, res) => {
  res.json(await portabilidad.analizar(req.body.bundle || req.body));
}));

router.post('/importar', requireEditor, asyncH(async (req, res) => {
  const bundle = req.body.bundle || req.body;
  const id = await portabilidad.importar(bundle,
    req.body.carpetaId, req.session.user.appRol?.UsuarioAppId);

  // La importación cuenta como el origen de la historia del reporte.
  await versionService.guardar({
    reporteId: id, version: 1, accion: 'IMPORTAR', definicion: bundle,
    nombreReporte: bundle.reporte?.Nombre,
    comentario: 'Importado desde archivo de definición', usuario: req.session.user
  });
  await auditoria.registrar({
    tipo: EVENTO.REPORTE_IMPORTAR, entidad: 'REPORTE', entidadId: id,
    usuario: req.session.user,
    descripcion: `Importó el reporte "${bundle.reporte?.Nombre}"`, ip: ipDe(req)
  });
  res.status(201).json({ ReporteId: id });
}));

module.exports = router;
