'use strict';
require('dotenv').config();
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
