'use strict';
const sql = require('mssql');

/**
 * Motor de consulta semántica: traduce una selección de campos del catálogo a
 * T-SQL. El usuario NUNCA escribe SQL; solo elige claves lógicas
 * ("VENTASDETALLE.IMPORTE"), de modo que todo lo que llega a la base de datos
 * proviene de una lista blanca.
 *
 * PROBLEMA CENTRAL — el "fan-out":
 * si se unen dos orígenes de hechos (ventas y existencias) por artículo, cada
 * venta se repite por cada fila de stock y los importes se inflan. Para evitarlo
 * el motor AGREGA CADA ORIGEN POR SEPARADO y solo después une los resultados
 * por las dimensiones comunes. Las dimensiones puras (artículos, clientes) sí
 * se unen directamente, porque la relación es muchos-a-uno y no multiplica filas.
 */

const AGREGACIONES = {
  SUMA: (e) => `SUM(${e})`,
  PROMEDIO: (e) => `AVG(CAST(${e} AS FLOAT))`,
  CONTEO: (e) => `COUNT(${e})`,
  CONTEO_DISTINTO: (e) => `COUNT(DISTINCT ${e})`,
  MIN: (e) => `MIN(${e})`,
  MAX: (e) => `MAX(${e})`
};

const OPERADORES = {
  IGUAL: '=', DISTINTO: '<>', MAYOR: '>', MAYOR_IGUAL: '>=',
  MENOR: '<', MENOR_IGUAL: '<=', CONTIENE: 'LIKE', ENTRE: 'BETWEEN', EN: 'IN'
};

/**
 * Periodos relativos: se resuelven a un rango de fechas concreto EN EL
 * SERVIDOR, de modo que «este mes» siga significando el mes en curso cada vez
 * que se abra el panel, sin que el usuario tenga que reescribir las fechas.
 */
const PERIODOS = {
  HOY: () => { const h = hoy(); return [h, h]; },
  AYER: () => { const d = hoy(); d.setDate(d.getDate() - 1); return [d, d]; },
  SEMANA_ACTUAL: () => {
    const d = hoy(); const lunes = new Date(d);
    lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // semana ISO: empieza el lunes
    return [lunes, d];
  },
  SEMANA_PASADA: () => {
    const d = hoy(); const lunes = new Date(d);
    lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return [lunes, domingo];
  },
  SEMANA_PASADA_LUN_SAB: () => {
    const d = hoy(); const lunes = new Date(d);
    lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
    const sabado = new Date(lunes); sabado.setDate(lunes.getDate() + 5);
    return [lunes, sabado];
  },
  MES_ACTUAL: () => {
    const d = hoy();
    return [new Date(d.getFullYear(), d.getMonth(), 1), d];
  },
  MES_ANTERIOR: () => {
    const d = hoy();
    return [new Date(d.getFullYear(), d.getMonth() - 1, 1),
            new Date(d.getFullYear(), d.getMonth(), 0)];
  },
  TRIMESTRE_ACTUAL: () => {
    const d = hoy(); const t = Math.floor(d.getMonth() / 3) * 3;
    return [new Date(d.getFullYear(), t, 1), d];
  },
  ANIO_ACTUAL: () => {
    const d = hoy();
    return [new Date(d.getFullYear(), 0, 1), d];
  },
  ANIO_ANTERIOR: () => {
    const d = hoy();
    return [new Date(d.getFullYear() - 1, 0, 1), new Date(d.getFullYear() - 1, 11, 31)];
  },
  ULTIMOS_7: () => rangoAtras(7),
  ULTIMOS_30: () => rangoAtras(30),
  ULTIMOS_90: () => rangoAtras(90),
  ULTIMOS_365: () => rangoAtras(365)
};

const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const rangoAtras = (dias) => {
  const h = hoy(); const desde = new Date(h);
  desde.setDate(h.getDate() - (dias - 1));
  return [desde, h];
};

/** Rango de fechas de un periodo relativo, o null si no se reconoce. */
function resolverPeriodo(clave) {
  const fn = PERIODOS[String(clave || '').toUpperCase()];
  return fn ? fn() : null;
}

/** Identificador seguro para alias generados. */
const alias = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');

class SemanticQueryError extends Error {
  constructor(mensaje) { super(mensaje); this.status = 400; }
}

class SemanticQueryEngine {
  /**
   * @param {object} catalogo  { origenes: Map<clave,origen>, relaciones: [] }
   *   origen: { Clave, Tipo, SqlBase, campos: Map<clave,campo> }
   * @param {object} consulta  { dimensiones:[], metricas:[], filtros:[], orden, limite }
   * @param {import('mssql').Request} request  se le enlazan los valores de filtro
   * @returns {{sql:string, columnas:[]}}
   */
  construir(catalogo, consulta, request) {
    const dimensiones = consulta.dimensiones || [];
    const metricas = consulta.metricas || [];
    if (!metricas.length && !dimensiones.length) {
      throw new SemanticQueryError('Seleccione al menos un campo.');
    }

    const refDim = dimensiones.map(c => this._resolver(catalogo, c, 'DIMENSION'));
    const refMet = metricas.map(c => this._resolver(catalogo, c, 'METRICA'));

    // Orígenes de hechos implicados: son los que aportan métricas.
    const hechos = [...new Set(refMet.map(r => r.origen.Clave))];
    if (!hechos.length) {
      // Sin métricas: listado simple de dimensiones (distinct).
      return this._consultaSoloDimensiones(catalogo, refDim, consulta, request);
    }

    const bloques = hechos.map(claveHecho => this._bloque(
      catalogo,
      catalogo.origenes.get(claveHecho),
      refDim,
      refMet.filter(r => r.origen.Clave === claveHecho),
      consulta.filtros || [],
      request));

    // Un solo origen de hechos: la consulta es directa.
    if (bloques.length === 1) {
      return this._envolver(bloques[0], refDim, refMet, consulta);
    }

    // Varios orígenes de hechos: cada uno ya viene agregado; se unen por las
    // dimensiones comunes, así los importes no se multiplican.
    const comunes = refDim.filter(d =>
      bloques.every(b => b.dimensiones.some(x => x.clave === d.clave)));
    if (!comunes.length) {
      throw new SemanticQueryError(
        'Para combinar varios orígenes hace falta al menos una dimensión común ' +
        '(por ejemplo el artículo o el almacén).');
    }
    return this._unirBloques(bloques, comunes, refDim, refMet, consulta);
  }

  /** Resuelve "ORIGEN.CAMPO" contra el catálogo (lista blanca estricta). */
  _resolver(catalogo, clave, rolEsperado) {
    const partes = String(clave).split('.');
    if (partes.length !== 2) {
      throw new SemanticQueryError(`Campo mal formado: "${clave}". Use ORIGEN.CAMPO.`);
    }
    const [claveOrigen, claveCampo] = partes;
    const origen = catalogo.origenes.get(claveOrigen);
    if (!origen) throw new SemanticQueryError(`El origen "${claveOrigen}" no existe en el catálogo.`);
    const campo = origen.campos.get(claveCampo);
    if (!campo) {
      throw new SemanticQueryError(
        `El campo "${claveCampo}" no existe en "${claveOrigen}". ` +
        `Puede que se haya retirado del catálogo.`);
    }
    if (campo.Obsoleto) {
      throw new SemanticQueryError(
        `El campo "${clave}" está obsoleto` +
        (campo.ReemplazadoPor ? `; use "${claveOrigen}.${campo.ReemplazadoPor}".` : '.'));
    }
    if (rolEsperado && campo.Rol !== rolEsperado) {
      throw new SemanticQueryError(
        `"${clave}" es una ${campo.Rol.toLowerCase()} y se está usando como ${rolEsperado.toLowerCase()}.`);
    }
    return { clave, origen, campo, alias: alias(`${claveOrigen}_${claveCampo}`) };
  }

  /** Relación declarada que permite enriquecer `origen` con `destino`. */
  _relacion(catalogo, origenClave, destinoClave) {
    return catalogo.relaciones.find(r =>
      r.Activo && r.Cardinalidad === 'N1' &&
      r.OrigenIzq === origenClave && r.OrigenDer === destinoClave);
  }

  /**
   * Traduce una dimensión de OTRO origen al campo equivalente de `hecho`.
   *
   * Al combinar dos orígenes de hechos, "VENTASDETALLE.CODARTICULO" y
   * "STOCKS.CODARTICULO" son la misma dimensión de negocio con claves
   * distintas. Se busca la relación declarada entre ambos (en cualquier
   * sentido) para saber qué campo del hecho actual le corresponde, y así poder
   * unir después los bloques por esa dimensión.
   */
  _campoEquivalente(catalogo, hecho, dim) {
    for (const r of catalogo.relaciones) {
      if (!r.Activo) continue;
      if (r.OrigenIzq === dim.origen.Clave && r.CampoIzq === dim.campo.Clave &&
          r.OrigenDer === hecho.Clave) {
        return hecho.campos.get(r.CampoDer);
      }
      if (r.OrigenDer === dim.origen.Clave && r.CampoDer === dim.campo.Clave &&
          r.OrigenIzq === hecho.Clave) {
        return hecho.campos.get(r.CampoIzq);
      }
    }
    return null;
  }

  /**
   * Construye el SELECT agregado de un origen de hechos, uniendo por N1 las
   * dimensiones que necesite. Devuelve también qué dimensiones pudo aportar.
   */
  _bloque(catalogo, hecho, refDim, refMet, filtros, request) {
    const joins = [];
    const dimsUsadas = [];
    const selDim = [];

    for (const d of refDim) {
      if (d.origen.Clave === hecho.Clave) {
        selDim.push(`h.${d.campo.Expresion} AS ${d.alias}`);
        dimsUsadas.push(d);
        continue;
      }
      // Dimensión de otro origen: primero se intenta traducirla a un campo
      // propio (caso de dos hechos que comparten artículo, almacén, fecha...).
      const equiv = this._campoEquivalente(catalogo, hecho, d);
      if (equiv) {
        selDim.push(`h.${equiv.Expresion} AS ${d.alias}`);
        dimsUsadas.push({ ...d, expresionLocal: `h.${equiv.Expresion}` });
        continue;
      }

      // Si no, solo si hay relación muchos-a-uno declarada (enriquecimiento).
      const rel = this._relacion(catalogo, hecho.Clave, d.origen.Clave);
      if (!rel) continue;             // este bloque no puede aportarla
      const aliasDim = alias(d.origen.Clave);
      if (!joins.some(j => j.alias === aliasDim)) {
        const campoIzq = hecho.campos.get(rel.CampoIzq);
        const campoDer = d.origen.campos.get(rel.CampoDer);
        if (!campoIzq || !campoDer) continue;
        joins.push({
          alias: aliasDim,
          sql: `LEFT JOIN (${d.origen.SqlBase}) ${aliasDim} ` +
               `ON ${aliasDim}.${campoDer.Expresion} = h.${campoIzq.Expresion}`
        });
      }
      selDim.push(`${aliasDim}.${d.campo.Expresion} AS ${d.alias}`);
      dimsUsadas.push(d);
    }

    const selMet = refMet.map(m => {
      const fn = AGREGACIONES[m.campo.Agregacion] || AGREGACIONES.SUMA;
      // COUNT(1) no debe llevar prefijo de tabla.
      const expr = /^\d+$/.test(m.campo.Expresion) ? m.campo.Expresion : `h.${m.campo.Expresion}`;
      return `${fn(expr)} AS ${m.alias}`;
    });

    const where = this._filtros(catalogo, hecho, filtros, joins, request);
    const grupo = dimsUsadas.map(d =>
      d.expresionLocal                                   // dimensión traducida
        ? d.expresionLocal
        : d.origen.Clave === hecho.Clave
          ? `h.${d.campo.Expresion}`
          : `${alias(d.origen.Clave)}.${d.campo.Expresion}`);

    const partes = [
      `SELECT ${[...selDim, ...selMet].join(', ') || '1 AS uno'}`,
      `FROM (${hecho.SqlBase}) h`,
      ...joins.map(j => j.sql),
      where.sql,
      grupo.length ? `GROUP BY ${grupo.join(', ')}` : ''
    ].filter(Boolean);

    return { sql: partes.join('\n'), dimensiones: dimsUsadas, metricas: refMet, hecho };
  }

  /** WHERE con valores SIEMPRE enlazados como parámetros. */
  _filtros(catalogo, hecho, filtros, joins, request) {
    const cond = [];
    let i = 0;
    for (const f of filtros || []) {
      const ref = this._resolver(catalogo, f.campo);
      // El filtro solo aplica si este bloque alcanza ese origen.
      const esDelHecho = ref.origen.Clave === hecho.Clave;
      const aliasDim = alias(ref.origen.Clave);
      const alcanzable = esDelHecho || joins.some(j => j.alias === aliasDim);
      if (!alcanzable) continue;

      const col = esDelHecho ? `h.${ref.campo.Expresion}` : `${aliasDim}.${ref.campo.Expresion}`;

      // Periodo relativo («este mes», «último año»…): se traduce aquí a un
      // rango concreto, así el panel siempre muestra el periodo vigente.
      if (f.operador === 'PERIODO') {
        const rango = resolverPeriodo(f.valor);
        if (!rango) throw new SemanticQueryError(`Periodo no reconocido: ${f.valor}`);
        const p1 = `f${i++}`, p2 = `f${i++}`;
        request.input(p1, sql.Date, rango[0]);
        request.input(p2, sql.Date, rango[1]);
        cond.push(`${col} BETWEEN @${p1} AND @${p2}`);
        continue;
      }

      const op = OPERADORES[f.operador || 'IGUAL'];
      if (!op) throw new SemanticQueryError(`Operador no admitido: ${f.operador}`);
      const tipo = this._tipoSql(ref.campo.TipoDato);

      if (op === 'BETWEEN') {
        const p1 = `f${i++}`, p2 = `f${i++}`;
        request.input(p1, tipo, this._valor(ref.campo, f.desde));
        request.input(p2, tipo, this._valor(ref.campo, f.hasta));
        cond.push(`${col} BETWEEN @${p1} AND @${p2}`);
      } else if (op === 'IN') {
        const valores = Array.isArray(f.valor) ? f.valor : [f.valor];
        const nombres = valores.map(v => {
          const p = `f${i++}`;
          request.input(p, tipo, this._valor(ref.campo, v));
          return `@${p}`;
        });
        cond.push(`${col} IN (${nombres.join(', ')})`);
      } else if (op === 'LIKE') {
        const p = `f${i++}`;
        request.input(p, sql.NVarChar(sql.MAX), `%${f.valor}%`);
        cond.push(`${col} LIKE @${p}`);
      } else {
        const p = `f${i++}`;
        request.input(p, tipo, this._valor(ref.campo, f.valor));
        cond.push(`${col} ${op} @${p}`);
      }
    }
    return { sql: cond.length ? `WHERE ${cond.join(' AND ')}` : '' };
  }

  _tipoSql(tipoDato) {
    switch (tipoDato) {
      case 'INT': return sql.Int;
      case 'DECIMAL': return sql.Decimal(18, 4);
      case 'DATE': return sql.Date;
      case 'DATETIME': return sql.DateTime2;
      case 'BOOL': return sql.Bit;
      default: return sql.NVarChar(sql.MAX);
    }
  }

  _valor(campo, v) {
    if (v === null || v === undefined || v === '') return null;
    switch (campo.TipoDato) {
      case 'INT': return parseInt(v, 10);
      case 'DECIMAL': return Number(v);
      case 'DATE':
      case 'DATETIME': return new Date(v);
      case 'BOOL': return v === true || v === 'true' || v === 1 || v === '1';
      default: return String(v);
    }
  }

  /** Listado de dimensiones sin métricas. */
  _consultaSoloDimensiones(catalogo, refDim, consulta, request) {
    const origen = refDim[0].origen;
    const bloque = this._bloque(catalogo, origen, refDim, [], consulta.filtros || [], request);
    const top = Math.min(Number(consulta.limite) || 500, 5000);
    return {
      sql: `SELECT DISTINCT TOP (${top}) * FROM (\n${bloque.sql}\n) q`,
      columnas: refDim.map(d => this._columna(d))
    };
  }

  _envolver(bloque, refDim, refMet, consulta) {
    const top = Math.min(Number(consulta.limite) || 1000, 20000);
    const orden = this._orden(consulta, refDim, refMet);
    return {
      sql: `SELECT TOP (${top}) * FROM (\n${bloque.sql}\n) q${orden}`,
      columnas: [...bloque.dimensiones, ...refMet].map(r => this._columna(r))
    };
  }

  /** Une bloques ya agregados por sus dimensiones comunes. */
  _unirBloques(bloques, comunes, refDim, refMet, consulta) {
    const top = Math.min(Number(consulta.limite) || 1000, 20000);
    const partes = bloques.map((b, i) => `(\n${b.sql}\n) b${i}`);
    const on = (i) => comunes.map(c => `b${i}.${c.alias} = b0.${c.alias}`).join(' AND ');

    const sel = [
      ...comunes.map(c => `b0.${c.alias}`),
      ...bloques.flatMap((b, i) => b.metricas.map(m => `b${i}.${m.alias}`))
    ];

    let from = partes[0];
    for (let i = 1; i < partes.length; i++) {
      // LEFT JOIN desde el primer bloque: conserva sus filas aunque el otro
      // origen no tenga datos para esa combinación.
      from += `\nLEFT JOIN ${partes[i]} ON ${on(i)}`;
    }
    const orden = this._orden(consulta, comunes, refMet);
    return {
      sql: `SELECT TOP (${top}) ${sel.join(', ')}\nFROM ${from}${orden}`,
      columnas: [...comunes, ...bloques.flatMap(b => b.metricas)].map(r => this._columna(r))
    };
  }

  /** ORDER BY validado contra los campos seleccionados. */
  _orden(consulta, refDim, refMet) {
    if (!consulta.orden) return '';
    const todos = [...refDim, ...refMet];
    const ref = todos.find(r => r.clave === consulta.orden.campo);
    if (!ref) return '';
    const dir = String(consulta.orden.direccion).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return `\nORDER BY ${ref.alias} ${dir}`;
  }

  _columna(ref) {
    return {
      clave: ref.clave,
      NombreCampo: ref.alias,
      AliasVisible: ref.campo.Etiqueta,
      Formato: ref.campo.Formato,
      Rol: ref.campo.Rol,
      VisiblePorDefecto: true
    };
  }
}

module.exports = {
  engine: new SemanticQueryEngine(), SemanticQueryError,
  AGREGACIONES, OPERADORES, PERIODOS, resolverPeriodo
};
