'use strict';
const { CronExpressionParser } = require('cron-parser');

/**
 * Calcula la próxima ejecución de una expresión cron estándar de 5 campos
 * (min hora díaMes mes díaSemana). Ej: '0 7 * * 1-5' = 7:00 de lunes a viernes.
 *
 * @param {string} expresion
 * @param {Date} [desde] fecha base (por defecto, ahora)
 * @returns {Date}
 */
function proximaEjecucion(expresion, desde = new Date()) {
  const it = CronExpressionParser.parse(expresion, { currentDate: desde });
  return it.next().toDate();
}

/** Valida una expresión cron sin lanzar. @returns {{valida:boolean, error?:string}} */
function validarCron(expresion) {
  try {
    CronExpressionParser.parse(expresion);
    return { valida: true };
  } catch (e) {
    return { valida: false, error: e.message };
  }
}

module.exports = { proximaEjecucion, validarCron };
