'use strict';
/**
 * Guarda de seguridad para el T-SQL que escriben los Creadores.
 *
 * La reportería es de SOLO LECTURA: no se permite modificar datos ni objetos.
 * Si un proceso necesita borrar o alterar algo, se implementa como un SP fuera
 * de esta herramienta; desde la interfaz nunca se escriben esas acciones.
 *
 * Estrategia (defensa en profundidad, este es el 2.º muro; el 1.º es el login
 * SQL de solo lectura de las conexiones de datos):
 *   1. Normalizar: quitar comentarios y literales, para que no sirvan de disfraz.
 *   2. Una sola sentencia: se prohíbe encadenar con ';'.
 *   3. Lista BLANCA de inicio: solo SELECT o WITH (CTE).
 *   4. Lista NEGRA de operaciones peligrosas sobre el texto ya normalizado.
 */

/** Operaciones prohibidas. Se evalúan como palabra completa. */
const PROHIBIDAS = [
  // --- DML de escritura ---
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'UPSERT',
  // --- DDL ---
  'CREATE', 'ALTER', 'DROP', 'RENAME',
  // --- Seguridad / usuarios ---
  'GRANT', 'REVOKE', 'DENY', 'IMPERSONATE', 'SETUSER', 'OPENROWSET',
  'OPENDATASOURCE', 'OPENQUERY', 'OPENXML',
  // --- Ejecución de código ---
  'EXEC', 'EXECUTE', 'RECONFIGURE', 'DBCC', 'SHUTDOWN', 'KILL',
  // --- Administración / IO ---
  'BACKUP', 'RESTORE', 'BULK', 'WAITFOR',
  // --- Transacciones (no tienen sentido en un reporte y ocultan efectos) ---
  'COMMIT', 'ROLLBACK', 'SAVE'
];

/** Prefijos de procedimientos del sistema. */
const PREFIJOS_PROHIBIDOS = ['sp_', 'xp_', 'fn_helpcollations'];

/** Sentencias con las que puede iniciar un reporte. */
const INICIOS_VALIDOS = ['SELECT', 'WITH'];

class SqlGuardError extends Error {
  constructor(mensaje, motivo) { super(mensaje); this.motivo = motivo; this.status = 400; }
}

/**
 * Quita comentarios (`--`, `/* *\/`) y literales de cadena, sustituyéndolos por
 * espacio. Así `'DROP'` dentro de un literal no es un falso positivo, y
 * `DR/**\/OP` o `-- \n DROP` no pueden usarse para evadir la revisión.
 */
function normalizar(sqlText) {
  let out = '';
  let i = 0;
  const n = sqlText.length;
  while (i < n) {
    const c = sqlText[i], c2 = sqlText[i + 1];
    // Comentario de línea
    if (c === '-' && c2 === '-') {
      while (i < n && sqlText[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    // Comentario de bloque (puede anidarse en T-SQL)
    if (c === '/' && c2 === '*') {
      let nivel = 1; i += 2;
      while (i < n && nivel > 0) {
        if (sqlText[i] === '/' && sqlText[i + 1] === '*') { nivel++; i += 2; }
        else if (sqlText[i] === '*' && sqlText[i + 1] === '/') { nivel--; i += 2; }
        else i++;
      }
      out += ' ';
      continue;
    }
    // Literal de cadena ('' escapa la comilla)
    if (c === "'") {
      i++;
      while (i < n) {
        if (sqlText[i] === "'" && sqlText[i + 1] === "'") { i += 2; continue; }
        if (sqlText[i] === "'") { i++; break; }
        i++;
      }
      out += " '' ";
      continue;
    }
    // Identificador entre corchetes: [mi columna] -> se conserva como token neutro
    if (c === '[') {
      while (i < n && sqlText[i] !== ']') i++;
      i++;
      out += ' _ident_ ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Sintaxis ACEPTADA para reportes basados en procedimiento almacenado:
 *
 *     EXEC [esquema.]nombre  [@p1 = {PARAM}[, @p2 = {OTRO}, ...]]
 *
 * Deliberadamente restrictiva: solo la llamada y asignaciones de parámetros.
 * No admite `;`, subconsultas, ni EXEC('...') dinámico.
 */
const EXEC_RE = new RegExp(
  '^\\s*EXEC(?:UTE)?\\s+' +                          // EXEC | EXECUTE
  '(?:\\[?([A-Za-z_][A-Za-z0-9_]*)\\]?\\s*\\.\\s*)?' + // esquema opcional
  '\\[?([A-Za-z_][A-Za-z0-9_]*)\\]?' +               // nombre del SP
  '((?:\\s*,?\\s*@[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*(?:\\{[A-Z0-9_]+\\}|-?[0-9.]+|\'\'))*)' +
  '\\s*;?\\s*$', 'i');

/**
 * Reconoce una llamada a procedimiento y valida que esté autorizado.
 * @param {string} sqlNormalizado
 * @param {Set<string>} permitidos  claves 'esquema.nombre' en minúsculas
 * @returns {{esEjecucionSp:boolean, esquema?:string, nombre?:string}}
 */
function analizarEjecucionSp(sqlNormalizado, permitidos) {
  const m = sqlNormalizado.match(EXEC_RE);
  if (!m) return { esEjecucionSp: false };
  const esquema = (m[1] || 'dbo').toLowerCase();
  const nombre = m[2].toLowerCase();
  // Nunca se permiten procedimientos del sistema, ni aunque estén en la lista.
  for (const pre of PREFIJOS_PROHIBIDOS) {
    if (nombre.startsWith(pre)) {
      throw new SqlGuardError(
        `No se permite ejecutar procedimientos del sistema ("${nombre}").`, 'SP_SISTEMA');
    }
  }
  if (!permitidos || !permitidos.has(`${esquema}.${nombre}`)) {
    throw new SqlGuardError(
      `El procedimiento "${esquema}.${nombre}" no está autorizado. ` +
      `Un administrador debe registrarlo en la lista blanca de procedimientos.`,
      'SP_NO_AUTORIZADO');
  }
  return { esEjecucionSp: true, esquema, nombre };
}

/**
 * Valida el SQL de un reporte. Lanza SqlGuardError si no es seguro.
 * @param {string} sqlText
 * @param {string} [contexto] nombre para el mensaje de error (ej. 'consulta CABECERA')
 * @param {{procedimientosPermitidos?:Set<string>}} [opciones]
 * @returns {{ok:true, esEjecucionSp?:boolean, esquema?:string, nombre?:string}}
 */
function validarSqlReporte(sqlText, contexto = 'La consulta', opciones = {}) {
  if (!sqlText || !sqlText.trim()) {
    throw new SqlGuardError(`${contexto} está vacía.`, 'VACIA');
  }

  const limpio = normalizar(sqlText);
  const upper = limpio.toUpperCase();

  // Vía alterna: llamada a un procedimiento almacenado AUTORIZADO.
  // Se resuelve antes que el resto porque EXEC está en la lista negra general.
  if (/^\s*EXEC(UTE)?\s/i.test(limpio)) {
    const sp = analizarEjecucionSp(limpio, opciones.procedimientosPermitidos);
    if (sp.esEjecucionSp) return { ok: true, ...sp };
    throw new SqlGuardError(
      `${contexto} usa una sintaxis de EXEC no admitida. Use: ` +
      `EXEC esquema.nombre @param = {PARAMETRO}`, 'EXEC_INVALIDO');
  }

  // 2) Una sola sentencia: ';' solo se tolera al final.
  const sinFinal = limpio.replace(/;\s*$/, '');
  if (sinFinal.includes(';')) {
    throw new SqlGuardError(
      `${contexto} no puede contener varias sentencias (';'). Escriba una sola consulta.`,
      'MULTIPLES_SENTENCIAS');
  }

  // 3) Lista blanca de inicio.
  const primeraPalabra = (upper.trim().match(/^[A-Z]+/) || [''])[0];
  if (!INICIOS_VALIDOS.includes(primeraPalabra)) {
    throw new SqlGuardError(
      `${contexto} debe comenzar con SELECT o WITH. Los reportes son de solo lectura.`,
      'INICIO_INVALIDO');
  }

  // 4) Lista negra de operaciones.
  for (const kw of PROHIBIDAS) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(upper)) {
      throw new SqlGuardError(
        `${contexto} contiene la operación no permitida "${kw}". ` +
        `La reportería es de solo lectura; los procesos que modifican datos ` +
        `se implementan como procedimientos almacenados fuera de esta herramienta.`,
        'OPERACION_PROHIBIDA');
    }
  }

  // SELECT ... INTO crea una tabla: se prohíbe (INTO solo es válido tras FROM).
  if (/\bINTO\b/i.test(upper)) {
    throw new SqlGuardError(
      `${contexto} no puede usar INTO (crearía una tabla).`, 'SELECT_INTO');
  }

  // Procedimientos del sistema.
  for (const pre of PREFIJOS_PROHIBIDOS) {
    if (new RegExp(`\\b${pre}`, 'i').test(limpio)) {
      throw new SqlGuardError(
        `${contexto} referencia objetos del sistema ("${pre}"), no permitido.`,
        'OBJETO_SISTEMA');
    }
  }

  return { ok: true };
}

/** Valida sin lanzar. @returns {{valida:boolean, error?:string, motivo?:string}} */
function revisarSql(sqlText, contexto, opciones) {
  try { validarSqlReporte(sqlText, contexto, opciones); return { valida: true }; }
  catch (e) { return { valida: false, error: e.message, motivo: e.motivo }; }
}

module.exports = {
  validarSqlReporte, revisarSql, normalizar, analizarEjecucionSp,
  SqlGuardError, PROHIBIDAS, EXEC_RE
};
