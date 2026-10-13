'use strict';
const { toMssqlType, coerce } = require('./sqlTypeMapper');
const { validarSqlReporte } = require('./sqlGuard');

const TOKEN_RE  = /\{([A-Z0-9_]+)\}/g;              // {PARAMETRO}
const IDENT_RE  = /^[A-Za-z_][A-Za-z0-9_]*$/;       // identificador T-SQL valido
const MULTI_SEP = '§';                         // separador para STRING_SPLIT

/**
 * Convierte una plantilla T-SQL con {PARAM} en un SQL con parametros ENLAZADOS.
 * Los valores del usuario NUNCA se concatenan al texto: viajan por request.input()
 * como parametros reales => inmunes a inyeccion SQL.
 */
class QueryTemplateEngine {
  /**
   * @param {string} sqlTemplate  SQL del creador con tokens {PARAM}
   * @param {Object[]} definiciones  filas rep.ReporteParametro (+ .opciones)
   * @param {Object} valores  { NOMBRE: valorUsuario }
   * @param {import('mssql').Request} request  request del pool destino (se muta)
   * @param {Object} [extra]  parametros del sistema ya enlazados (ej. __vinculo)
   * @returns {string} SQL final con @parametros
   *
   * Si la plantilla es una llamada a procedimiento (`EXEC sp @p = {PARAM}`), el
   * reemplazo produce `EXEC sp @p = @PARAM`, de modo que los valores tambien
   * viajan enlazados, nunca concatenados.
   */
  build(sqlTemplate, definiciones, valores, request, extra = {}) {
    validarSqlReporte(sqlTemplate, 'El reporte');
    const defMap = new Map(definiciones.map(d => [d.Nombre, d]));
    const registrados = new Set();

    return sqlTemplate.replace(TOKEN_RE, (_, nombre) => {
      if (nombre in extra) return `@${nombre}`;      // parametros del sistema
      const def = defMap.get(nombre);
      if (!def) throw new Error(`Parametro no definido en el reporte: {${nombre}}`);

      const raw = (valores && nombre in valores) ? valores[nombre] : def.ValorDefault;
      if (def.Obligatorio && (raw === null || raw === undefined || raw === '')) {
        throw new Error(`Parametro obligatorio faltante: ${nombre}`);
      }

      // 1) IDENTIFICADOR (columna/tabla dinamica) -> whitelist, NUNCA se enlaza.
      if (def.Clase === 'IDENTIFICADOR') {
        return this._resolveIdentifier(def, raw);
      }

      // 2) Multiseleccion -> un solo parametro enlazado + STRING_SPLIT (SS2016).
      if (def.PermiteMultiple) {
        if (!registrados.has(nombre)) {
          const arr = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
          const joined = arr.filter(v => v !== '' && v != null)
                            .map(v => String(coerce(def, v))).join(MULTI_SEP);
          request.input(nombre, toMssqlType(def), joined);
          registrados.add(nombre);
        }
        // El creador escribe:  col IN ({VENDEDORES})
        return `SELECT value FROM STRING_SPLIT(@${nombre}, '${MULTI_SEP}')`;
      }

      // 3) Valor escalar -> parametro ENLAZADO (inmune a inyeccion).
      if (!registrados.has(nombre)) {
        request.input(nombre, toMssqlType(def), coerce(def, raw));
        registrados.add(nombre);
      }
      return `@${nombre}`;
    });
  }

  _resolveIdentifier(def, raw) {
    const permitidos = (def.opciones || []).map(o => o.Valor);
    if (!permitidos.includes(raw) || !IDENT_RE.test(String(raw))) {
      throw new Error(`Identificador no permitido para ${def.Nombre}: ${raw}`);
    }
    return `[${String(raw).replace(/]/g, ']]')}]`; // QUOTENAME manual
  }
}

module.exports = new QueryTemplateEngine();
