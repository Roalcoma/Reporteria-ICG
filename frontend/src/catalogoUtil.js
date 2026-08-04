// Utilidades para navegar el catálogo semántico desde la interfaz.

/**
 * Campos que se pueden usar junto a un origen: los suyos y los que alcanza a
 * través de sus relaciones.
 *
 * Es lo que hace que elegir VENTASDETALLE dé acceso inmediato a la descripción
 * o la familia del artículo: la relación ya está declarada en el catálogo, así
 * que el usuario no tiene que saber que existe otra tabla detrás.
 *
 * @param {object} catalogo  { origenes:[], relaciones:[] }
 * @param {string[]} clavesOrigen  orígenes ya implicados en el widget
 * @returns {{campos:[], origenes:[]}} campos con `viaRelacion` marcado
 */
export function camposAlcanzables(catalogo, clavesOrigen = []) {
  const porClave = new Map((catalogo?.origenes || []).map(o => [o.clave, o]));
  const relaciones = catalogo?.relaciones || [];
  const directos = new Set(clavesOrigen.filter(Boolean));

  // Orígenes alcanzables en un salto desde cualquiera de los ya implicados.
  const alcanzados = new Map();   // clave -> desde qué origen se llega
  for (const clave of directos) {
    for (const r of relaciones) {
      if (r.izq === clave && !directos.has(r.der)) alcanzados.set(r.der, clave);
      if (r.der === clave && !directos.has(r.izq)) alcanzados.set(r.izq, clave);
    }
  }

  const campos = [];
  const añadir = (origen, viaRelacion, desde) => {
    for (const c of origen.campos || []) {
      campos.push({
        ...c,
        origen: origen.clave,
        origenNombre: origen.nombre,
        viaRelacion,
        desde
      });
    }
  };

  // Si no hay ningún origen elegido todavía, se ofrece el catálogo completo.
  if (!directos.size) {
    for (const o of catalogo?.origenes || []) añadir(o, false, null);
    return { campos, origenes: (catalogo?.origenes || []).map(o => o.clave) };
  }

  for (const clave of directos) {
    const o = porClave.get(clave);
    if (o) añadir(o, false, null);
  }
  for (const [clave, desde] of alcanzados) {
    const o = porClave.get(clave);
    if (o) añadir(o, true, desde);
  }
  return { campos, origenes: [...directos, ...alcanzados.keys()] };
}

/** Orígenes implicados en una consulta, deducidos de sus campos. */
export function origenesDeConsulta(consulta) {
  const claves = [
    ...(consulta?.dimensiones || []),
    ...(consulta?.metricas || []),
    ...(consulta?.filtros || []).map(f => f.campo)
  ].filter(Boolean).map(c => String(c).split('.')[0]);
  return [...new Set(claves)];
}

/** Etiqueta legible de un campo a partir de su clave lógica. */
export function etiquetaDe(catalogo, clave) {
  if (!clave) return '';
  const [origenClave, campoClave] = String(clave).split('.');
  const origen = (catalogo?.origenes || []).find(o => o.clave === origenClave);
  const campo = origen?.campos.find(c => c.nombre === campoClave || c.clave === clave);
  return campo ? campo.etiqueta : clave;
}
