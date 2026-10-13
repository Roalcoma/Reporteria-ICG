'use strict';
/**
 * Worker del planificador: proceso SEPARADO del API (`npm run worker`).
 *
 * Por qué vive aparte: un reporte programado sobre un año de ventas puede tardar
 * minutos. Dentro del API ocuparía el mismo proceso que atiende a los usuarios
 * interactivos y la aplicación se sentiría lenta. Separarlos permite además
 * reiniciar el API sin perder los trabajos que ya están en cola.
 *
 * No depende de SQL Server Agent (no existe en la edición Express, habitual en
 * clientes pequeños) ni de Redis (sería un servicio más que instalar y vigilar
 * en el servidor del cliente). La cola es una tabla del propio SQL Server.
 *
 * Tres relojes independientes:
 *   · cada minuto  → encola las programaciones vencidas y recalcula su próxima corrida;
 *   · cada 5 s     → drena la cola reclamando trabajos;
 *   · cada 10 min  → recupera trabajos que quedaron colgados por un worker caído.
 *
 * PUEDEN CORRER VARIOS WORKERS A LA VEZ, incluso en distintos servidores: el
 * reclamo de cada trabajo es atómico (UPDLOCK + READPAST en schedulerService),
 * así que dos workers nunca procesan el mismo. Cada uno necesita su propio
 * WORKER_ID en el .env para que la bitácora distinga quién hizo qué.
 */
require('./config'); // carga backend/.env con ruta fija, sin depender del cwd
const cron = require('node-cron');
const cm = require('./db/connectionManager');
const scheduler = require('./services/schedulerService');
const jobRunner = require('./services/jobRunner');
const { proximaEjecucion } = require('./services/cronUtil');
const cfg = require('./config');

const log = (...a) => console.log(`[${new Date().toISOString()}] [${cfg.workerId}]`, ...a);

let drenando = false;

/** Drena la cola: reclama y procesa jobs hasta que no queden pendientes. */
async function drenarCola() {
  if (drenando) return;              // evita solapamiento entre ticks
  drenando = true;
  try {
    for (;;) {
      const job = await scheduler.tomarSiguiente();
      if (!job) break;
      log(`job ${job.JobId} (prog ${job.ProgramacionId}) intento ${job.Intentos}/${job.MaxIntentos}`);
      try {
        const r = await jobRunner.ejecutar(job);
        await scheduler.marcarOk(job.JobId);
        log(`job ${job.JobId} OK`, r.omitido ? '(programación inactiva)' : `${r.filas} filas → ${r.formato}`);
      } catch (e) {
        log(`job ${job.JobId} ERROR: ${e.message}`);
        await scheduler.marcarError(job.JobId, e.message);
      }
    }
  } catch (e) {
    log('error drenando la cola:', e.message);
  } finally {
    drenando = false;
  }
}

// Cada minuto: encola las programaciones vencidas y recalcula su próxima corrida.
cron.schedule('* * * * *', async () => {
  try {
    const n = await scheduler.encolarVencidas(proximaEjecucion);
    if (n) log(`encoladas ${n} programación(es)`);
  } catch (e) { log('error encolando:', e.message); }
});

// Cada 10 min: recupera jobs que quedaron colgados por un worker caído.
cron.schedule('*/10 * * * *', async () => {
  try {
    const n = await scheduler.recuperarZombis(30);
    if (n) log(`recuperados ${n} job(s) zombi`);
  } catch (e) { log('error recuperando zombis:', e.message); }
});

// Drena la cola cada 5 s.
setInterval(drenarCola, 5000);
log('worker iniciado');

const shutdown = async () => { log('deteniendo…'); await cm.closeAll(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Tras una actualización el código en disco cambia: bajo NSSM, salir entre jobs
// hace que el servicio vuelva a arrancar con la versión nueva.
if (process.env.ACTUALIZACION_REINICIAR === '1') {
  const fs = require('fs');
  const pkg = require('path').join(__dirname, '../package.json');
  const versionCargada = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
  setInterval(() => {
    try {
      const enDisco = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
      if (enDisco !== versionCargada && !drenando) {
        log(`versión nueva ${enDisco} (cargada ${versionCargada}): reiniciando`);
        shutdown();
      }
    } catch { /* package.json a medio copiar: reintenta en el próximo tick */ }
  }, 60_000).unref();
}
