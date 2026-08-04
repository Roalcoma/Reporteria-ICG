'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const cfg = require('../config');

/**
 * Scheduler basado en la propia BD SQL Server (sin Redis, sin SQL Agent).
 * - encolarVencidas(): crea jobs para las rep.Programacion cuya ProximaEjecucion
 *   ya paso (idealmente llamado por node-cron cada minuto).
 * - tomarSiguiente(): reclama UN job de forma atomica con UPDLOCK+READPAST, de
 *   modo que varios workers pueden correr en paralelo sin tomar el mismo job.
 *
 * El procesamiento real (ejecutar reporte -> exportar -> enviar correo) lo hace
 * el worker inyectando un callback `procesar(job)`.
 */
class SchedulerService {
  /**
   * Genera jobs para las programaciones vencidas y recalcula su ProximaEjecucion.
   *
   * - Una programación recién creada (ProximaEjecucion NULL) NO se dispara de
   *   inmediato: solo se inicializa su próxima corrida según el cron.
   * - Un cron inválido se aísla: se marca esa programación y el ciclo continúa
   *   con las demás en vez de abortar todo.
   *
   * @param {(expr:string)=>Date} calcularProxima
   * @returns {Promise<number>} cantidad de jobs encolados
   */
  async encolarVencidas(calcularProxima) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(`
      SELECT ProgramacionId, CronExpresion, ProximaEjecucion
      FROM rep.Programacion
      WHERE Activo = 1 AND (ProximaEjecucion IS NULL OR ProximaEjecucion <= SYSDATETIME())`);

    let encolados = 0;
    for (const p of recordset) {
      let proxima;
      try {
        proxima = calcularProxima(p.CronExpresion);
      } catch (e) {
        // Cron inválido: desactiva esa programación y sigue con el resto.
        await pool.request()
          .input('pid', sql.Int, p.ProgramacionId)
          .query(`UPDATE rep.Programacion SET Activo = 0 WHERE ProgramacionId = @pid`);
        console.error(`Programación ${p.ProgramacionId} desactivada: cron inválido "${p.CronExpresion}"`);
        continue;
      }

      // Primera vez: solo fija la próxima corrida, sin ejecutar retroactivamente.
      if (p.ProximaEjecucion == null) {
        await pool.request()
          .input('pid', sql.Int, p.ProgramacionId)
          .input('prox', sql.DateTime2, proxima)
          .query(`UPDATE rep.Programacion SET ProximaEjecucion = @prox WHERE ProgramacionId = @pid`);
        continue;
      }

      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await new sql.Request(tx)
          .input('pid', sql.Int, p.ProgramacionId)
          .query(`INSERT INTO rep.JobCola (ProgramacionId, Estado, ProgramadoPara)
                  VALUES (@pid, 'PENDIENTE', SYSDATETIME())`);
        await new sql.Request(tx)
          .input('pid', sql.Int, p.ProgramacionId)
          .input('prox', sql.DateTime2, proxima)
          .query(`UPDATE rep.Programacion
                  SET ProximaEjecucion = @prox, UltimaEjecucion = SYSDATETIME()
                  WHERE ProgramacionId = @pid`);
        await tx.commit();
        encolados++;
      } catch (e) {
        await tx.rollback();
        console.error(`Error encolando programación ${p.ProgramacionId}:`, e.message);
      }
    }
    return encolados;
  }

  /**
   * Reclama atomicamente el siguiente job PENDIENTE para este worker.
   * READPAST salta las filas ya bloqueadas por otros workers (no colisiona).
   * @returns {object|null} el job reclamado, o null si no hay pendientes.
   */
  async tomarSiguiente() {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('w', sql.NVarChar(80), cfg.workerId)
      .query(`
        WITH siguiente AS (
          SELECT TOP (1) *
          FROM rep.JobCola WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE Estado = 'PENDIENTE'
            AND ProgramadoPara <= SYSDATETIME()
            AND Intentos < MaxIntentos
          ORDER BY ProgramadoPara, JobId
        )
        UPDATE siguiente
        SET Estado = 'PROCESANDO', LockWorker = @w, LockFecha = SYSDATETIME(),
            Intentos = Intentos + 1
        OUTPUT inserted.JobId, inserted.ProgramacionId, inserted.Intentos,
               inserted.MaxIntentos;`);
    return recordset[0] || null;
  }

  /**
   * Devuelve a PENDIENTE los jobs que quedaron PROCESANDO por un worker caído.
   * @param {number} minutos antigüedad del lock a partir de la cual se considera zombi.
   */
  async recuperarZombis(minutos = 30) {
    const pool = await cm.getConfigPool();
    const { rowsAffected } = await pool.request()
      .input('m', sql.Int, minutos)
      .query(`UPDATE rep.JobCola
              SET Estado = CASE WHEN Intentos >= MaxIntentos THEN 'ERROR' ELSE 'PENDIENTE' END,
                  LockWorker = NULL, LockFecha = NULL,
                  MensajeError = ISNULL(MensajeError, 'Recuperado: worker sin responder')
              WHERE Estado = 'PROCESANDO'
                AND LockFecha < DATEADD(MINUTE, -@m, SYSDATETIME())`);
    return rowsAffected[0] || 0;
  }

  async marcarOk(jobId) {
    const pool = await cm.getConfigPool();
    await pool.request().input('id', sql.BigInt, jobId).query(
      `UPDATE rep.JobCola SET Estado='OK', FechaFin=SYSDATETIME() WHERE JobId=@id`);
  }

  /** Marca ERROR; si aun quedan intentos lo devuelve a PENDIENTE con backoff. */
  async marcarError(jobId, mensaje) {
    const pool = await cm.getConfigPool();
    await pool.request()
      .input('id', sql.BigInt, jobId)
      .input('msg', sql.NVarChar(sql.MAX), String(mensaje).slice(0, 3900))
      .query(`
        UPDATE rep.JobCola
        SET MensajeError = @msg,
            Estado = CASE WHEN Intentos >= MaxIntentos THEN 'ERROR' ELSE 'PENDIENTE' END,
            ProgramadoPara = DATEADD(MINUTE, 5, SYSDATETIME()),
            LockWorker = NULL, LockFecha = NULL,
            FechaFin = CASE WHEN Intentos >= MaxIntentos THEN SYSDATETIME() ELSE NULL END
        WHERE JobId = @id`);
  }
}

module.exports = new SchedulerService();
