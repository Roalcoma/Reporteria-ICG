/**
 * Estructura y normalización de la configuración de un panel.
 *
 * Aquí vive el «contrato» del JSON que guarda un dashboard, separado de los
 * componentes para que el editor, la vista y las pruebas compartan una única
 * definición de qué es un panel válido.
 *
 * TAMAÑOS POR TRAMOS, NO EN PÍXELES. Un objeto ocupa «un tercio», «la mitad»,
 * «dos tercios» o «el ancho completo» sobre una rejilla de seis columnas. Con
 * medidas libres, un panel diseñado en una pantalla ancha se descuadra en otra
 * más estrecha; por tramos siempre encaja. El precio es no poder afinar al
 * píxel, que es justo lo que falta para el arrastre de bordes pendiente.
 *
 * COMPATIBILIDAD HACIA ATRÁS. `normalizar()` es lo que permite añadir campos a
 * la configuración sin migrar los paneles ya guardados en cada cliente: rellena
 * lo que falte al abrir. Al introducir una propiedad nueva, dele aquí un valor
 * por defecto en vez de asumir que existe.
 *
 * PERIODOS relativos ("este mes", "últimos 30 días") se guardan por CLAVE, no
 * como fechas. El servidor los resuelve al ejecutar, de modo que el panel sigue
 * mostrando el período en curso cada vez que se abre, sin reescribir nada.
 */

export const ANCHOS = [
  { id: 'tercio', nombre: 'Un tercio', columnas: 2 },
  { id: 'medio', nombre: 'Mitad', columnas: 3 },
  { id: 'dosTercios', nombre: 'Dos tercios', columnas: 4 },
  { id: 'completo', nombre: 'Ancho completo', columnas: 6 }
];
export const ALTOS = [
  { id: 'bajo', nombre: 'Bajo', px: 210 },
  { id: 'medio', nombre: 'Medio', px: 300 },
  { id: 'alto', nombre: 'Alto', px: 430 }
];

export const columnasDe = (ancho) =>
  (ANCHOS.find(a => a.id === ancho) || ANCHOS[1]).columnas;
export const pixelesDe = (alto) =>
  (ALTOS.find(a => a.id === alto) || ALTOS[1]).px;

/**
 * Rellena lo que falte en una configuración guardada.
 *
 * Los paneles creados antes de las pestañas no tienen `tabs` ni `tabId`; se les
 * asigna una pestaña por defecto para que sigan abriéndose igual que siempre.
 */
export function normalizar(cfg) {
  const base = cfg || {};
  const tabs = base.tabs?.length ? base.tabs : [{ id: 'tab1', nombre: 'Panel' }];
  const primera = tabs[0].id;
  return {
    ...base,
    tabs,
    widgets: (base.widgets || []).map(w => ({
      ancho: 'medio', alto: 'medio',
      emite: true,       // al pulsarlo, filtra a los demás
      recibe: true,      // le afectan los filtros del panel
      ...w,
      tabId: w.tabId || primera
    })),
    filtros: (base.filtros || []).map(f => ({
      ancho: 'tercio', alto: 'medio', afecta: 'TODOS',
      ...f,
      tabId: f.tabId || primera
    }))
  };
}

/** Periodos relativos que ofrece un filtro de fecha. */
export const PERIODOS = [
  { id: 'HOY', nombre: 'Hoy' },
  { id: 'AYER', nombre: 'Ayer' },
  { id: 'SEMANA_ACTUAL', nombre: 'Esta semana' },
  { id: 'MES_ACTUAL', nombre: 'Este mes' },
  { id: 'MES_ANTERIOR', nombre: 'Mes anterior' },
  { id: 'TRIMESTRE_ACTUAL', nombre: 'Este trimestre' },
  { id: 'ANIO_ACTUAL', nombre: 'Este año' },
  { id: 'ANIO_ANTERIOR', nombre: 'Año anterior' },
  { id: 'ULTIMOS_7', nombre: 'Últimos 7 días' },
  { id: 'ULTIMOS_30', nombre: 'Últimos 30 días' },
  { id: 'ULTIMOS_90', nombre: 'Últimos 90 días' },
  { id: 'ULTIMOS_365', nombre: 'Últimos 12 meses' }
];

/**
 * Traduce el estado de un filtro a la condición que entiende el motor.
 * Devuelve null si el filtro aún no tiene nada seleccionado.
 */
export function condicionDe(filtro, valor) {
  if (!filtro.campo) return null;
  if (filtro.tipo === 'fecha') {
    const v = valor || {};
    if (v.periodo) return { campo: filtro.campo, operador: 'PERIODO', valor: v.periodo };
    if (v.desde && v.hasta) {
      return { campo: filtro.campo, operador: 'ENTRE', desde: v.desde, hasta: v.hasta };
    }
    return null;
  }
  const vals = Array.isArray(valor) ? valor : [];
  return vals.length ? { campo: filtro.campo, operador: 'EN', valor: vals } : null;
}

/** Valor efectivo de un filtro: el fijado por quien lo diseñó si no es editable. */
export function valorEfectivo(filtro, valoresFiltro) {
  if (filtro.editable === false) return filtro.valorFijo ?? (filtro.tipo === 'fecha' ? {} : []);
  return valoresFiltro[filtro.id] ?? (filtro.tipo === 'fecha' ? {} : []);
}

/**
 * Filtros que debe aplicar un objeto concreto.
 *
 * Respeta el alcance configurado: un objeto puede quedar al margen de los
 * filtros, y un filtro puede dirigirse solo a ciertos objetos. Los filtros
 * ocultos también cuentan: sirven para acotar el panel sin ocupar espacio.
 */
export function filtrosPara(objetoId, objeto, filtros, valoresFiltro, seleccion) {
  if (objeto && objeto.recibe === false) return [];
  const lista = [];
  for (const f of filtros || []) {
    const alcanza = f.afecta === 'TODOS' || !f.afecta ||
      (Array.isArray(f.afecta) && f.afecta.includes(objetoId));
    if (!alcanza) continue;
    const cond = condicionDe(f, valorEfectivo(f, valoresFiltro));
    if (cond) lista.push(cond);
  }
  // La selección hecha en otro objeto no se aplica sobre sí mismo.
  if (seleccion && seleccion.origenId !== objetoId) {
    lista.push({ campo: seleccion.campo, operador: 'IGUAL', valor: seleccion.valor });
  }
  return lista;
}

/** Disposiciones rápidas para ordenar los objetos de una pestaña. */
export const LAYOUTS = [
  { id: 'mitades', nombre: 'Dos por fila', icono: '▥',
    aplicar: (objs) => objs.map(o => ({ ...o, ancho: 'medio' })) },
  { id: 'tercios', nombre: 'Tres por fila', icono: '▤',
    aplicar: (objs) => objs.map(o => ({ ...o, ancho: 'tercio' })) },
  { id: 'apilado', nombre: 'Uno por fila', icono: '▬',
    aplicar: (objs) => objs.map(o => ({ ...o, ancho: 'completo' })) },
  { id: 'destacado', nombre: 'Primero destacado', icono: '◨',
    aplicar: (objs) => objs.map((o, i) =>
      ({ ...o, ancho: i === 0 ? 'completo' : 'medio' })) }
];

/** Mueve un elemento de una posición a otra dentro de la lista. */
export function reordenar(lista, idOrigen, idDestino) {
  const desde = lista.findIndex(x => x.id === idOrigen);
  const hasta = lista.findIndex(x => x.id === idDestino);
  if (desde < 0 || hasta < 0 || desde === hasta) return lista;
  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movido);
  return copia;
}
