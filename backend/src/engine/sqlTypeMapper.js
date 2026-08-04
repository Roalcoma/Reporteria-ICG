'use strict';
const sql = require('mssql');

/**
 * Mapea el TipoDato de rep.ReporteParametro a un tipo de node-mssql.
 * DECIMAL SIEMPRE con precision/escala explicitas: node-mssql redondea a
 * escala 0 si no se declara (ver memoria reference-mssql-decimal-scale).
 */
function toMssqlType(param) {
  switch (param.TipoDato) {
    case 'INT':      return sql.Int;
    case 'STRING':   return sql.NVarChar(sql.MAX);
    case 'DATE':     return sql.Date;
    case 'DATETIME': return sql.DateTime2;
    case 'BOOL':     return sql.Bit;
    case 'DECIMAL':  return sql.Decimal(param.Precision || 18, param.Escala || 2);
    default:         return sql.NVarChar(sql.MAX);
  }
}

/** Convierte el valor crudo del usuario al tipo JS correcto (o null). */
function coerce(param, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (param.TipoDato) {
    case 'INT':      return parseInt(raw, 10);
    case 'DECIMAL':  return Number(raw);
    case 'BOOL':     return raw === true || raw === 'true' || raw === 1 || raw === '1';
    case 'DATE':
    case 'DATETIME': return new Date(raw);
    default:         return String(raw);
  }
}

module.exports = { toMssqlType, coerce };
