async function req(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(msg.error || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

const post = (url, body) => req(url, { method: 'POST', body: JSON.stringify(body) });

/** Mensaje del servidor ({ error }) para descargas que fallan; si no hay JSON, el genérico. */
const errorDe = (res, generico) => res.json().then(j => j.error || generico).catch(() => generico);

export const api = {
  login: (password) => post('/api/login', { password }),
  logout: () => post('/api/logout', {}),
  me: () => req('/api/me'),
  fijarEmpresa: (codEmpresa) => post('/api/sesion/empresa', { codEmpresa }),
  empresas: (area) => req(`/api/empresas?area=${area}`),

  carpetas: () => req('/api/carpetas'),
  reportes: (carpetaId) =>
    req(`/api/reportes${carpetaId != null ? `?carpetaId=${carpetaId}` : ''}`),
  reporte: (id) => req(`/api/reportes/${id}`),

  crearCarpeta: (c) => post('/api/carpetas', c),
  actualizarCarpeta: (id, c) => req(`/api/carpetas/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  eliminarCarpeta: (id) => req(`/api/carpetas/${id}`, { method: 'DELETE' }),

  crearReporte: (def) => post('/api/reportes', def),
  duplicarReporte: (id, opts = {}) => post(`/api/reportes/${id}/duplicar`, opts),
  actualizarReporte: (id, def) => req(`/api/reportes/${id}`, { method: 'PUT', body: JSON.stringify(def) }),
  eliminarReporte: (id) => req(`/api/reportes/${id}`, { method: 'DELETE' }),

  catalogoDashboards: () => req('/api/dashboards/catalogo'),
  consultarSemantico: (consulta) => post('/api/dashboards/consultar', { consulta }),
  valoresDe: (campo) => post('/api/dashboards/valores', { campo }),
  dashboards: () => req('/api/dashboards'),
  dashboard: (id) => req(`/api/dashboards/${id}`),
  crearDashboard: (d) => post('/api/dashboards', d),
  actualizarDashboard: (id, d) => req(`/api/dashboards/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  eliminarDashboard: (id) => req(`/api/dashboards/${id}`, { method: 'DELETE' }),

  origenes: () => req('/api/catalogo/origenes'),
  origen: (id) => req(`/api/catalogo/origenes/${id}`),
  probarOrigen: (sqlBase, area) => post('/api/catalogo/origenes/probar', { sqlBase, area }),
  crearOrigen: (def) => post('/api/catalogo/origenes', def),
  actualizarOrigen: (id, def) => req(`/api/catalogo/origenes/${id}`, { method: 'PUT', body: JSON.stringify(def) }),
  eliminarOrigen: (id, forzar) =>
    req(`/api/catalogo/origenes/${id}${forzar ? '?forzar=true' : ''}`, { method: 'DELETE' }),

  perfiles: () => req('/api/perfiles'),
  perfil: (id) => req(`/api/perfiles/${id}`),
  crearPerfil: (p) => post('/api/perfiles', p),
  actualizarPerfil: (id, p) => req(`/api/perfiles/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  eliminarPerfil: (id) => req(`/api/perfiles/${id}`, { method: 'DELETE' }),
  perfilesDeUsuario: (cod) => req(`/api/perfiles/usuario/${cod}`),
  setPerfilesDeUsuario: (cod, perfilIds, login) =>
    req(`/api/perfiles/usuario/${cod}`, { method: 'PUT', body: JSON.stringify({ perfilIds, login }) }),

  programaciones: () => req('/api/programaciones'),
  crearProgramacion: (p) => post('/api/programaciones', p),
  activarProgramacion: (id, activo) =>
    req(`/api/programaciones/${id}/activo`, { method: 'PUT', body: JSON.stringify({ Activo: activo }) }),
  eliminarProgramacion: (id) => req(`/api/programaciones/${id}`, { method: 'DELETE' }),
  ejecutarAhora: (id) => post(`/api/programaciones/${id}/ejecutar-ahora`, {}),
  validarCron: (CronExpresion) => post('/api/programaciones/validar-cron', { CronExpresion }),
  historial: () => req('/api/programaciones/historial'),

  usuarios: ({ filtro = '', soloAsignados = false } = {}) =>
    req(`/api/usuarios?filtro=${encodeURIComponent(filtro)}&soloAsignados=${soloAsignados}`),
  roles: () => req('/api/usuarios/roles'),
  asignarRol: (cod, appRolId, login) =>
    req(`/api/usuarios/${cod}/rol`, { method: 'PUT', body: JSON.stringify({ appRolId, login }) }),
  activarUsuario: (cod, activo) =>
    req(`/api/usuarios/${cod}/activo`, { method: 'PUT', body: JSON.stringify({ Activo: activo }) }),
  quitarRol: (cod) => req(`/api/usuarios/${cod}`, { method: 'DELETE' }),

  brandingLista: () => req('/api/branding'),
  brandingGet: (codigoICG, tipo = 'GESTION', ejercicio = null) =>
    req(`/api/branding/empresa?codigoICG=${codigoICG}&tipo=${tipo}${ejercicio != null ? `&ejercicio=${ejercicio}` : ''}`),
  brandingQuitarLogo: (codigoICG, tipo = 'GESTION', ejercicio = null) =>
    req(`/api/branding/empresa/logo?codigoICG=${codigoICG}&tipo=${tipo}${ejercicio != null ? `&ejercicio=${ejercicio}` : ''}`, { method: 'DELETE' }),
  guardarBranding: (b) => req('/api/branding/empresa', { method: 'PUT', body: JSON.stringify(b) }),


  auditoriaEventos: (q = {}) =>
    req('/api/auditoria/eventos?' + new URLSearchParams(
      Object.entries(q).filter(([, v]) => v !== '' && v != null)).toString()),
  auditoriaTipos: () => req('/api/auditoria/tipos'),
  estadisticas: (dias = 30) => req(`/api/auditoria/estadisticas?dias=${dias}`),
  ejecucionesDe: (reporteId) => req(`/api/auditoria/reporte/${reporteId}/ejecuciones`),
  versiones: (reporteId) => req(`/api/reportes/${reporteId}/versiones`),

  correoConfigs: () => req('/api/correo'),
  crearCorreoConfig: (c) => post('/api/correo', c),
  actualizarCorreoConfig: (id, c) => req(`/api/correo/${id}`, { method: 'PUT', body: JSON.stringify(c) }),

  descubrirColumnas: (payload) => post('/api/reportes/columnas/descubrir', payload),
  analizarDefinicion: (bundle) => post('/api/reportes/definicion/analizar', { bundle }),
  importarDefinicion: (bundle, carpetaId) => post('/api/reportes/importar', { bundle, carpetaId }),

  async exportarDefinicion(id) {
    const res = await fetch(`/api/reportes/${id}/definicion`, { credentials: 'include' });
    if (!res.ok) throw new Error(await errorDe(res, 'Falló la exportación de la definición'));
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="(.+?)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : `reporte-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  opcionesParam: (id, paramId, seleccion) =>
    post(`/api/reportes/${id}/parametros/${paramId}/opciones`, seleccion),

  empresaSps: (filtro) =>
    req(`/api/procedimientos/empresa/sps${filtro ? `?filtro=${encodeURIComponent(filtro)}` : ''}`),
  empresaVistas: (filtro) =>
    req(`/api/procedimientos/empresa/vistas${filtro ? `?filtro=${encodeURIComponent(filtro)}` : ''}`),
  empresaDefinicion: (esquema, nombre) =>
    req(`/api/procedimientos/empresa/definicion?esquema=${encodeURIComponent(esquema)}&nombre=${encodeURIComponent(nombre)}`),
  empresaAlterar: (definicion) =>
    req('/api/procedimientos/empresa/alterar', { method: 'PUT', body: JSON.stringify({ definicion }) }),

  tablasIcgCatalogo: () => req('/api/reportes/tablas-icg/catalogo'),
  tablasIcgColumnas: (tabla, codEmpresa) =>
    req(`/api/reportes/tablas-icg/columnas?tabla=${encodeURIComponent(tabla)}&codEmpresa=${codEmpresa ?? ''}`),
  guardarVista: (id, vista) => req(`/api/reportes/${id}/vista`, { method: 'PUT', body: JSON.stringify(vista) }),
  ejecutar: (id, payload) => post(`/api/reportes/${id}/ejecutar`, payload),
  enviar: (id, payload) => post(`/api/reportes/${id}/enviar`, payload),

  checkActualizacion: () => req('/api/actualizacion/check'),
  aplicarActualizacion: () => post('/api/actualizacion/aplicar', {}),
  estadoActualizacion: () => req('/api/actualizacion/estado'),
  health: () => req('/api/health'),

  async exportar(id, payload) {
    const res = await fetch(`/api/reportes/${id}/exportar`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await errorDe(res, 'Falló la exportación'));
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="(.+?)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : `reporte.${payload.formato.toLowerCase()}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
};
