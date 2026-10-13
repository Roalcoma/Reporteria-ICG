'use strict';
const cfg        = require('./config'); // primero: carga backend/.env con ruta fija, sin depender del cwd
const fs         = require('fs');
const path       = require('path');
const express    = require('express');
const session    = require('express-session');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const MSSQLStore = require('connect-mssql-v2');
const cm         = require('./db/connectionManager');
const { migrarAlArrancar, estadoMigraciones } = require('./db/migraciones');
const { authService, AuthError } = require('./services/authService');
const { requireAuth, asyncH }    = require('./middleware/auth');
const carpetasRoutes       = require('./routes/carpetas.routes');
const reportesRoutes       = require('./routes/reportes.routes');
const programacionesRoutes = require('./routes/programaciones.routes');
const auditoriaRoutes      = require('./routes/auditoria.routes');
const procedimientosRoutes = require('./routes/procedimientos.routes');
const brandingRoutes       = require('./routes/branding.routes');
const usuariosRoutes       = require('./routes/usuarios.routes');
const perfilesRoutes       = require('./routes/perfiles.routes');
const dashboardsRoutes     = require('./routes/dashboards.routes');
const catalogoAdminRoutes  = require('./routes/catalogoAdmin.routes');
const correoRoutes         = require('./routes/correo.routes');
const actualizacionRoutes  = require('./routes/actualizacion.routes');
const { auditoria, EVENTO } = require('./services/auditoriaService');

const ipDe = (req) =>
  (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim() || null;

const app = express();

// Bug fix #1 — CORS restringido al origen del frontend (no más origin:true).
const origenesPermitidos = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(s => s.trim());
app.use(cors({ origin: origenesPermitidos, credentials: true }));

app.use(express.json({ limit: '4mb' }));

// Bug fix #2 — Sesiones persistidas en SQL Server (connect-mssql-v2).
// La tabla [dbo].[sessions] se crea sola la primera vez que arranca el servidor.
const storeConfig = {
  server:   cfg.configDb.server,
  database: cfg.configDb.database,
  user:     cfg.configDb.user,
  password: cfg.configDb.password,
  options:  { encrypt: false, trustServerCertificate: true }
};
app.use(session({
  store: new MSSQLStore(storeConfig, { autoRemove: true, autoRemoveInterval: 1000 * 60 * 30 }),
  secret: cfg.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

// Bug fix #3 — Rate limiting en el login: máx 20 intentos / 15 min por IP.
app.use('/api/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Espere 15 minutos.' }
}));

// --- Auth: SOLO CONTRASEÑA ---
app.post('/api/login', asyncH(async (req, res) => {
  const ip = ipDe(req);
  try {
    const u = await authService.loginPorPassword(req.body.password);
    req.session.user = u;
    req.session.empresaGestion = null;
    const empresas = await authService.getEmpresasGestion(u.codUsuario);
    await auditoria.registrar({
      tipo: EVENTO.LOGIN, entidad: 'SESION', usuario: u,
      descripcion: `Inició sesión (${u.appRol.Nombre})`, ip
    });
    res.json({
      usuario: u.usuario, codUsuario: u.codUsuario,
      rol: u.appRol.Nombre, permisos: u.appRol,
      empresas: empresas.map(({ servidor, baseDatos, ...pub }) => pub)
    });
  } catch (e) {
    if (e instanceof AuthError) {
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

app.post('/api/sesion/empresa', requireAuth, asyncH(async (req, res) => {
  const cod = Number(req.body.codEmpresa);
  const emp = await authService.assertEmpresaPermitida(
    req.session.user.codUsuario, 'GESTION', cod);
  req.session.empresaGestion = { codEmpresa: emp.codEmpresa, nombre: emp.nombre };
  res.json(req.session.empresaGestion);
}));

app.get('/api/empresas', requireAuth, asyncH(async (req, res) => {
  const cod  = req.session.user.codUsuario;
  const area = (req.query.area || 'GESTION').toUpperCase();
  let empresas;
  if (area === 'CONTABLE') {
    const g = req.session.empresaGestion?.codEmpresa ?? null;
    empresas = await authService.getEmpresasContables(cod, g);
  } else {
    empresas = await authService.getEmpresasGestion(cod);
  }
  res.json(empresas.map(({ servidor, baseDatos, ...pub }) => pub));
}));

app.use('/api/carpetas',      carpetasRoutes);
app.use('/api/reportes',      reportesRoutes);
app.use('/api/programaciones', programacionesRoutes);
app.use('/api/auditoria',     auditoriaRoutes);
app.use('/api/procedimientos', procedimientosRoutes);
app.use('/api/branding',      brandingRoutes);
app.use('/api/usuarios',      usuariosRoutes);
app.use('/api/perfiles',      perfilesRoutes);
app.use('/api/dashboards',    dashboardsRoutes);
app.use('/api/catalogo',      catalogoAdminRoutes);
app.use('/api/correo',        correoRoutes);
app.use('/api/actualizacion', actualizacionRoutes);

app.get('/api/health', (req, res) => res.json({
  ok: true, version: require('../package.json').version, migraciones: estadoMigraciones()
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Frontend compilado (npm run build en frontend-vue). En producción todo se sirve
// desde este puerto: Vite solo se usa en desarrollo.
const DIST = path.resolve(__dirname, '../../frontend-vue/dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '7d', immutable: true }));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html'), { maxAge: 0 }));
} else {
  console.warn(`[server] No existe ${DIST}: ejecute "npm run build" en frontend-vue para servir la interfaz.`);
}

app.use((err, req, res, _next) => {
  if (err instanceof AuthError) return res.status(403).json({ error: err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno' });
});

const server = app.listen(cfg.port, () => {
  console.log(`ICG Reportería API escuchando en :${cfg.port}`);
  migrarAlArrancar();
});

const shutdown = async () => { await cm.closeAll(); server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
