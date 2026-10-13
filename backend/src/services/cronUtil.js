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

const _hoyMedNoche = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const _fmt = (d) => d.toISOString().split('T')[0]; // YYYY-MM-DD

/** Devuelve el lunes de la semana pasada (no la semana en curso). */
function _lunesPasado() {
  const d = _hoyMedNoche();
  // dow 0=Dom…6=Sab; días hasta el lunes de esta semana + 7 para retroceder a la semana anterior
  const r = new Date(d);
  r.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
  return r;
}

/**
 * Palabras clave de período que pueden usarse como valor en ParametrosJson
 * de rep.Programacion. Se resuelven a fechas concretas en el momento de ejecución.
 *
 * Valores soportados:
 *   SEMANA_PASADA_INICIO   → lunes de la semana pasada  (YYYY-MM-DD)
 *   SEMANA_PASADA_FIN_SAB  → sábado de la semana pasada (YYYY-MM-DD)
 *   SEMANA_PASADA_FIN_DOM  → domingo de la semana pasada (YYYY-MM-DD)
 */
const PERIODOS_PARAM = {
  SEMANA_PASADA_INICIO:  () => _fmt(_lunesPasado()),
  SEMANA_PASADA_FIN_SAB: () => { const l = _lunesPasado(); l.setDate(l.getDate() + 5); return _fmt(l); },
  SEMANA_PASADA_FIN_DOM: () => { const l = _lunesPasado(); l.setDate(l.getDate() + 6); return _fmt(l); },
};

/**
 * Resuelve palabras clave de período en los parámetros de una programación.
 * Los valores que no sean palabras clave pasan sin cambios.
 *
 * @param {Object} parametros  { NOMBRE: valor | keyword }
 * @returns {Object}  los mismos parámetros con las keywords ya resueltas a fechas
 */
function resolverPeriodosFecha(parametros) {
  if (!parametros || typeof parametros !== 'object') return parametros;
  const result = {};
  for (const [k, v] of Object.entries(parametros)) {
    const fn = typeof v === 'string' && PERIODOS_PARAM[v.toUpperCase()];
    result[k] = fn ? fn() : v;
  }
  return result;
}

module.exports = { proximaEjecucion, validarCron, resolverPeriodosFecha };
