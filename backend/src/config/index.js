'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const num = (v, def) => (v === undefined ? def : Number(v));

function resolverSessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s !== 'cambia-esto' && s !== 'dev-secret') return s;
  // Uno aleatorio es seguro pero invalida las sesiones en cada reinicio.
  console.warn('[config] SESSION_SECRET no configurado en .env: se usa uno aleatorio; las sesiones se perderán al reiniciar.');
  return require('crypto').randomBytes(32).toString('hex');
}

/** Opciones comunes de node-mssql para SQL Server on-premise (ICG). */
const commonOptions = {
  options: {
    encrypt: false,               // instancias ICG locales normalmente sin TLS
    trustServerCertificate: true,
    enableArithAbort: true,
    // ICG guarda hora local sin zona: con useUTC (default) las fechas llegaban
    // corridas 3-4 h y el scheduler comparaba UTC contra SYSDATETIME() local.
    useUTC: false
  },
  requestTimeout: num(process.env.QUERY_TIMEOUT_MS, 120000)
};

module.exports = {
  port: num(process.env.PORT, 3010),
  sessionSecret: resolverSessionSecret(),
  cryptoKeyHex: process.env.APP_CRYPTO_KEY || '',

  // Pool FIJO -> BD de configuracion propia
  configDb: {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.CONFIG_DB_NAME || 'ICG_Reporteria_Config',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: { max: 10, min: 1, idleTimeoutMillis: 60000 },
    ...commonOptions
  },

  // Pool dedicado -> GENERAL de ICG (solo lectura)
  generalDb: {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.GENERAL_DB_NAME || 'GENERAL',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
    ...commonOptions
  },

  // Credencial por defecto para pools dinamicos de datos ICG
  dataDbDefault: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },

  dataPool: {
    max: num(process.env.DATA_POOL_MAX, 10),
    idleMinutes: num(process.env.DATA_POOL_IDLE_MINUTES, 30)
  },

  commonOptions,
  workerId: process.env.WORKER_ID || 'worker-1',

  /**
   * Logins de ICG con rol Administrador garantizado (bootstrap y recuperacion).
   * Se comparan sin distinguir mayusculas.
   */
  adminLogins: (process.env.ADMIN_LOGINS || '')
    .split(';').map(s => s.trim().toLowerCase()).filter(Boolean),

  /**
   * Codigos de usuario de ICG que pueden administrar el catalogo semantico.
   * Por defecto solo el 0 (SUPERVISOR): un origen mal definido afecta a todos
   * los dashboards y su SQL corre sobre las bases de ICG.
   */
  catalogoAdmins: (process.env.CATALOGO_ADMIN_CODUSUARIOS || '0')
    .split(';').map(s => Number(s.trim())).filter(n => !Number.isNaN(n))
};
