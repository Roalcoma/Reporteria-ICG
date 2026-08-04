'use strict';
/**
 * Prueba del SCHEDULER contra la BD de configuracion real.
 * Verifica lo mas delicado: que varios workers en paralelo NUNCA tomen el mismo
 * job (claim atomico con UPDLOCK + READPAST) y la recuperacion de trabajos
 * huerfanos.
 *
 * No forma parte de `npm test`: requiere la BD creada y el .env configurado.
 *   node test/scheduler.manual.js
 */
require('dotenv').config();
const sql = require('mssql');
const cm = require('../src/db/connectionManager');
const scheduler = require('../src/services/schedulerService');
const { proximaEjecucion, validarCron } = require('../src/services/cronUtil');
const cfg = require('../src/config');

let ok = 0, fallos = 0;
const check = (cond, nombre, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.error(`  ✗ ${nombre} ${detalle}`); }
};

(async () => {
  const pool = await cm.getConfigPool();

  console.log('\n[1] Preparacion: jobs de prueba en la cola');
  // Se usan ProgramacionId NULL para no depender de reportes reales.
  await pool.request().query(`DELETE FROM rep.JobCola WHERE ProgramacionId IS NULL`);
  const N = 12;
  for (let i = 0; i < N; i++) {
    await pool.request().query(
      `INSERT INTO rep.JobCola (ProgramacionId, Estado, ProgramadoPara)
       VALUES (NULL, 'PENDIENTE', SYSDATETIME())`);
  }
  const { recordset: ini } = await pool.request().query(
    `SELECT COUNT(*) AS n FROM rep.JobCola WHERE ProgramacionId IS NULL AND Estado='PENDIENTE'`);
  check(ini[0].n === N, `${N} jobs encolados`, `(hay ${ini[0].n})`);

  console.log('\n[2] Claim concurrente: 4 workers compiten por la cola');
  // Cada "worker" reclama repetidamente hasta vaciar la cola.
  const reclamar = async (idWorker) => {
    const mios = [];
    for (;;) {
      cfg.workerId = idWorker;                 // identifica al worker en el lock
      const job = await scheduler.tomarSiguiente();
      if (!job) break;
      mios.push(job.JobId);
    }
    return mios;
  };
  const resultados = await Promise.all([
    reclamar('w1'), reclamar('w2'), reclamar('w3'), reclamar('w4')
  ]);
  const todos = resultados.flat();
  const unicos = new Set(todos);

  check(todos.length === N, `se reclamaron los ${N} jobs`, `(fueron ${todos.length})`);
  check(unicos.size === todos.length,
    'ningun job fue tomado por dos workers a la vez',
    `(${todos.length} reclamos, ${unicos.size} distintos)`);
  console.log(`    reparto: ${resultados.map((r, i) => `w${i + 1}=${r.length}`).join(' ')}`);

  console.log('\n[3] Cierre de jobs');
  const mitad = todos.slice(0, Math.floor(N / 2));
  for (const id of mitad) await scheduler.marcarOk(id);
  const { recordset: okRows } = await pool.request().query(
    `SELECT COUNT(*) AS n FROM rep.JobCola WHERE ProgramacionId IS NULL AND Estado='OK'`);
  check(okRows[0].n === mitad.length, `${mitad.length} jobs marcados OK`, `(hay ${okRows[0].n})`);

  console.log('\n[4] Reintentos: un fallo devuelve el job a PENDIENTE');
  const jobFallo = todos[mitad.length];
  await scheduler.marcarError(jobFallo, 'Fallo simulado de prueba');
  const { recordset: e1 } = await pool.request()
    .input('id', sql.BigInt, jobFallo)
    .query(`SELECT Estado, Intentos, MaxIntentos, MensajeError FROM rep.JobCola WHERE JobId=@id`);
  check(e1[0].Estado === 'PENDIENTE', 'con intentos disponibles vuelve a PENDIENTE',
    `(quedo ${e1[0].Estado})`);
  check(e1[0].MensajeError?.includes('simulado'), 'guarda el mensaje de error');

  // Se agotan los intentos: debe quedar en ERROR definitivo.
  await pool.request().input('id', sql.BigInt, jobFallo)
    .query(`UPDATE rep.JobCola SET Intentos = MaxIntentos WHERE JobId=@id`);
  await scheduler.marcarError(jobFallo, 'Ultimo intento');
  const { recordset: e2 } = await pool.request()
    .input('id', sql.BigInt, jobFallo)
    .query(`SELECT Estado, FechaFin FROM rep.JobCola WHERE JobId=@id`);
  check(e2[0].Estado === 'ERROR', 'agotados los intentos queda en ERROR',
    `(quedo ${e2[0].Estado})`);
  check(e2[0].FechaFin != null, 'registra la fecha de fin');

  console.log('\n[5] Recuperacion de jobs huerfanos (worker caido)');
  const zombi = todos[todos.length - 1];
  await pool.request().input('id', sql.BigInt, zombi).query(
    `UPDATE rep.JobCola
     SET Estado='PROCESANDO', LockWorker='worker-muerto', Intentos=0,
         LockFecha=DATEADD(MINUTE,-90,SYSDATETIME())
     WHERE JobId=@id`);
  const recuperados = await scheduler.recuperarZombis(30);
  const { recordset: z } = await pool.request()
    .input('id', sql.BigInt, zombi)
    .query(`SELECT Estado, LockWorker FROM rep.JobCola WHERE JobId=@id`);
  check(recuperados >= 1, `se recuperaron ${recuperados} job(s) colgados`);
  check(z[0].Estado === 'PENDIENTE', 'el job huerfano vuelve a PENDIENTE', `(quedo ${z[0].Estado})`);
  check(z[0].LockWorker === null, 'se libera el lock del worker caido');

  console.log('\n[6] Un job PROCESANDO reciente NO se toca');
  const activo = todos[1];
  await pool.request().input('id', sql.BigInt, activo).query(
    `UPDATE rep.JobCola SET Estado='PROCESANDO', LockWorker='w-vivo', LockFecha=SYSDATETIME()
     WHERE JobId=@id`);
  await scheduler.recuperarZombis(30);
  const { recordset: a } = await pool.request()
    .input('id', sql.BigInt, activo)
    .query(`SELECT Estado FROM rep.JobCola WHERE JobId=@id`);
  check(a[0].Estado === 'PROCESANDO', 'el job en curso sigue PROCESANDO', `(quedo ${a[0].Estado})`);

  console.log('\n[7] Calculo de la proxima ejecucion (cron)');
  const prox = proximaEjecucion('0 7 * * 1-5');
  check(prox > new Date(), 'la proxima corrida es futura', `(${prox.toISOString()})`);
  check(prox.getHours() === 7, 'respeta la hora indicada', `(hora ${prox.getHours()})`);
  check(validarCron('*/15 * * * *').valida === true, 'valida una expresion correcta');
  check(validarCron('no-es-cron').valida === false, 'rechaza una expresion invalida');

  console.log('\n[8] Limpieza');
  const del = await pool.request().query(
    `DELETE FROM rep.JobCola WHERE ProgramacionId IS NULL; SELECT @@ROWCOUNT AS n`);
  console.log(`    ${del.recordset[0].n} jobs de prueba eliminados`);

  console.log(`\n${ok} comprobaciones OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  await cm.closeAll();
  process.exit(fallos ? 1 : 0);
})().catch(async e => {
  console.error('\nERROR NO CONTROLADO:', e.message);
  try { await cm.closeAll(); } catch {}
  process.exit(1);
});
