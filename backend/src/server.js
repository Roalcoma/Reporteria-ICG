'use strict';
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const cfg = require('./config');
const cm = require('./db/connectionManager');
const { authService, AuthError } = require('./services/authService');
const { requireAuth, asyncH } = require('./middleware/auth');
const carpetasRoutes = require('./routes/carpetas.routes');
const reportesRoutes = require('./routes/reportes.routes');
const programacionesRoutes = require('./routes/programaciones.routes');
const auditoriaRoutes = require('./routes/auditoria.routes');
const procedimientosRoutes = require('./routes/procedimientos.routes');
const brandingRoutes = require('./routes/branding.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const perfilesRoutes = require('./routes/perfiles.routes');
const dashboardsRoutes = require('./routes/dashboards.routes');
const catalogoAdminRoutes = require('./routes/catalogoAdmin.routes');
const { auditoria, EVENTO } = require('./services/auditoriaService');

/** IP del cliente para la bitácora. */
const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
  .toString().split(',')[0].trim() || null;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(session({
  secret: cfg.sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

// --- Auth: SOLO CONTRASENA (la clave identifica al usuario en ICG) ---
app.post('/api/login', asyncH(async (req, res) => {
  const ip = ipDe(req);
  try {
    const u = await authService.loginPorPassword(req.body.password);
    req.session.user = u;
    req.session.empresaGestion = null; // se elige en el paso siguiente
    const empresas = await authService.getEmpresasGestion(u.codUsuario);
    await auditoria.registrar({
      tipo: EVENTO.LOGIN, entidad: 'SESION', usuario: u,
      descripcion: `Inició sesión (${u.appRol.Nombre})`, ip
    });
    res.json({
      usuario: u.usuario, codUsuario: u.codUsuario,
      rol: u.appRol.Nombre, permisos: u.appRol,
      // El usuario debe elegir empresa de gestion antes de operar.
      empresas: empresas.map(({ servidor, baseDatos, ...pub }) => pub)
    });
  } catch (e) {
    if (e instanceof AuthError) {
      // Nunca se registra la contraseña intentada, solo el hecho del fallo.
      await auditoria.registrar({
        tipo: EVENTO.LOGIN_FALLIDO, entidad: 'SESION', exitoso: false,
        descripcion: e.message, ip
      });
      return res.status(401).json({ error: e.message });
    }
    throw e;
  }
}));

app.post('/api/logout', (req, res) => {
  const u = req.session.user;
  if (u) auditoria.registrar({ tipo: EVENTO.LOGOUT, entidad: 'SESION', usuario: u, ip: ipDe(req) });
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  const u = req.session.user;
  res.json({
    usuario: u.usuario, codUsuario: u.codUsuario,
    rol: u.appRol.Nombre, permisos: u.appRol,
    empresaGestion: req.session.empresaGestion || null
  });
});

/** Fija la empresa de GESTION activa de la sesion (revalidando el permiso). */
app.post('/api/sesion/empresa', requireAuth, asyncH(async (req, res) => {
  const cod = Number(req.body.codEmpresa);
  const emp = await authService.assertEmpresaPermitida(
    req.session.user.codUsuario, 'GESTION', cod);
  req.session.empresaGestion = { codEmpresa: emp.codEmpresa, nombre: emp.nombre };
  res.json(req.session.empresaGestion);
}));

// --- Empresas permitidas (selector de contexto) ---
app.get('/api/empresas', requireAuth, asyncH(async (req, res) => {
  const cod = req.session.user.codUsuario;
  const area = (req.query.area || 'GESTION').toUpperCase();
  let empresas;
  if (area === 'CONTABLE') {
    // Solo las contables asociadas a la empresa de gestion activa.
    const g = req.session.empresaGestion ? req.session.empresaGestion.codEmpresa : null;
    empresas = await authService.getEmpresasContables(cod, g);
  } else {
    empresas = await authService.getEmpresasGestion(cod);
  }
  // Nunca exponemos servidor/baseDatos al cliente.
  res.json(empresas.map(({ servidor, baseDatos, ...pub }) => pub));
}));

// --- Módulos de reportes ---
app.use('/api/carpetas', carpetasRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/programaciones', programacionesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/procedimientos', procedimientosRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/perfiles', perfilesRoutes);
app.use('/api/dashboards', dashboardsRoutes);
app.use('/api/catalogo', catalogoAdminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Manejador de errores central ---
app.use((err, req, res, _next) => {
  if (err instanceof AuthError) return res.status(403).json({ error: err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno' });
});

const server = app.listen(cfg.port, () =>
  console.log(`ICG Reportería API escuchando en :${cfg.port}`));

const shutdown = async () => { await cm.closeAll(); server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
