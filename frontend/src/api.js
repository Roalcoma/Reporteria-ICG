/**
 * Cliente HTTP de la aplicación: ÚNICO punto por el que el frontend habla con
 * el API. Ningún componente debe llamar a `fetch` directamente; si falta una
 * operación, se añade aquí.
 *
 * Se centraliza por tres motivos concretos:
 *  · `credentials: 'include'` en todas las llamadas — sin eso la cookie de
 *    sesión no viaja y el servidor responde 401 aunque el usuario haya entrado;
 *  · el error del servidor se convierte en una excepción con el mensaje real,
 *    de modo que los componentes solo hacen try/catch y muestran `e.message`;
 *  · las descargas binarias (exportar, definición) necesitan tratar la respuesta
 *    como blob y disparar el «Guardar como», que no encaja en el flujo JSON.
 *
 * Las rutas son relativas a propósito: en desarrollo las redirige el proxy de
 * Vite y en producción las sirve el mismo origen, así que no hay ninguna URL de
 * servidor incrustada que haya que cambiar al desplegar en un cliente.
 */

/** Petición JSON. Lanza Error con el mensaje del servidor si la respuesta no es 2xx. */
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

export const api = {
  /** Login solo por contraseña: devuelve { usuario, rol, permisos, empresas[] }. */
  login: (password) => post('/api/login', { password }),
  logout: () => post('/api/logout', {}),
  me: () => req('/api/me'),
  /** Fija la empresa de gestión activa de la sesión. */
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

  // --- Dashboards autogestionados ---
  /** Catálogo de orígenes y campos disponibles para construir widgets. */
  catalogoDashboards: () => req('/api/dashboards/catalogo'),
  /** Ejecuta una consulta semántica sin guardar nada (previsualización). */
  consultarSemantico: (consulta) => post('/api/dashboards/consultar', { consulta }),
  valoresDe: (campo) => post('/api/dashboards/valores', { campo }),

  dashboards: () => req('/api/dashboards'),
  dashboard: (id) => req(`/api/dashboards/${id}`),
  crearDashboard: (d) => post('/api/dashboards', d),
  actualizarDashboard: (id, d) => req(`/api/dashboards/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  eliminarDashboard: (id) => req(`/api/dashboards/${id}`, { method: 'DELETE' }),
  compartirDashboard: (id, destinos) =>
    req(`/api/dashboards/${id}/compartir`, { method: 'PUT', body: JSON.stringify(destinos) }),

  // --- Administración del catálogo de orígenes (solo SUPERVISOR) ---
  origenes: () => req('/api/catalogo/origenes'),
  origen: (id) => req(`/api/catalogo/origenes/${id}`),
  /** Valida y ejecuta el SQL (TOP 20) devolviendo columnas sugeridas y muestra. */
  probarOrigen: (sqlBase, area) => post('/api/catalogo/origenes/probar', { sqlBase, area }),
  crearOrigen: (def) => post('/api/catalogo/origenes', def),
  actualizarOrigen: (id, def) =>
    req(`/api/catalogo/origenes/${id}`, { method: 'PUT', body: JSON.stringify(def) }),
  duplicarOrigen: (id, opts) => post(`/api/catalogo/origenes/${id}/duplicar`, opts),
  eliminarOrigen: (id, forzar) =>
    req(`/api/catalogo/origenes/${id}${forzar ? '?forzar=true' : ''}`, { method: 'DELETE' }),
  crearRelacion: (r) => post('/api/catalogo/relaciones', r),
  eliminarRelacion: (id) => req(`/api/catalogo/relaciones/${id}`, { method: 'DELETE' }),

  // --- Perfiles de reporte ---
  perfiles: () => req('/api/perfiles'),
  perfil: (id) => req(`/api/perfiles/${id}`),
  crearPerfil: (p) => post('/api/perfiles', p),
  actualizarPerfil: (id, p) => req(`/api/perfiles/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  eliminarPerfil: (id) => req(`/api/perfiles/${id}`, { method: 'DELETE' }),
  setReportesDePerfil: (id, reporteIds) =>
    req(`/api/perfiles/${id}/reportes`, { method: 'PUT', body: JSON.stringify({ reporteIds }) }),
  perfilesDeUsuario: (cod) => req(`/api/perfiles/usuario/${cod}`),
  setPerfilesDeUsuario: (cod, perfilIds, login) =>
    req(`/api/perfiles/usuario/${cod}`, { method: 'PUT', body: JSON.stringify({ perfilIds, login }) }),
  actualizarReporte: (id, def) => req(`/api/reportes/${id}`, { method: 'PUT', body: JSON.stringify(def) }),
  eliminarReporte: (id) => req(`/api/reportes/${id}`, { method: 'DELETE' }),

  // --- Scheduler ---
  programaciones: () => req('/api/programaciones'),
  crearProgramacion: (p) => post('/api/programaciones', p),
  activarProgramacion: (id, activo) =>
    req(`/api/programaciones/${id}/activo`, { method: 'PUT', body: JSON.stringify({ Activo: activo }) }),
  eliminarProgramacion: (id) => req(`/api/programaciones/${id}`, { method: 'DELETE' }),
  ejecutarAhora: (id) => post(`/api/programaciones/${id}/ejecutar-ahora`, {}),
  validarCron: (CronExpresion) => post('/api/programaciones/validar-cron', { CronExpresion }),
  historial: () => req('/api/programaciones/historial'),

  // --- Usuarios y roles ---
  usuarios: ({ filtro = '', soloAsignados = false } = {}) =>
    req(`/api/usuarios?filtro=${encodeURIComponent(filtro)}&soloAsignados=${soloAsignados}`),
  roles: () => req('/api/usuarios/roles'),
  asignarRol: (cod, appRolId, login) =>
    req(`/api/usuarios/${cod}/rol`, { method: 'PUT', body: JSON.stringify({ appRolId, login }) }),
  activarUsuario: (cod, activo) =>
    req(`/api/usuarios/${cod}/activo`, { method: 'PUT', body: JSON.stringify({ Activo: activo }) }),
  quitarRol: (cod) => req(`/api/usuarios/${cod}`, { method: 'DELETE' }),
  usuariosHistorial: (cod) =>
    req(`/api/usuarios/historial${cod ? `?cod=${cod}` : ''}`),

  // --- Branding (identidad corporativa por empresa) ---
  brandingLista: () => req('/api/branding'),
  brandingDe: (tipo, codigoICG, ejercicio) =>
    req(`/api/branding/empresa?tipo=${tipo}&codigoICG=${codigoICG}` +
        `${ejercicio != null ? `&ejercicio=${ejercicio}` : ''}`),
  guardarBranding: (b) => req('/api/branding/empresa', { method: 'PUT', body: JSON.stringify(b) }),
  eliminarLogo: (tipo, codigoICG, ejercicio) =>
    req(`/api/branding/empresa/logo?tipo=${tipo}&codigoICG=${codigoICG}` +
        `${ejercicio != null ? `&ejercicio=${ejercicio}` : ''}`, { method: 'DELETE' }),

  // --- Lista blanca de procedimientos almacenados ---
  procedimientos: () => req('/api/procedimientos'),
  descubrirSp: (filtro) =>
    req(`/api/procedimientos/descubrir${filtro ? `?filtro=${encodeURIComponent(filtro)}` : ''}`),
  autorizarSp: (p) => post('/api/procedimientos', p),
  activarSp: (id, activo) =>
    req(`/api/procedimientos/${id}/activo`, { method: 'PUT', body: JSON.stringify({ Activo: activo }) }),
  revocarSp: (id) => req(`/api/procedimientos/${id}`, { method: 'DELETE' }),

  // --- Auditoría, estadísticas y evolución ---
  auditoriaEventos: (q = {}) =>
    req('/api/auditoria/eventos?' + new URLSearchParams(
      Object.entries(q).filter(([, v]) => v !== '' && v != null)).toString()),
  auditoriaTipos: () => req('/api/auditoria/tipos'),
  estadisticas: (dias = 30) => req(`/api/auditoria/estadisticas?dias=${dias}`),
  ejecucionesDe: (reporteId) => req(`/api/auditoria/reporte/${reporteId}/ejecuciones`),
  versiones: (reporteId) => req(`/api/reportes/${reporteId}/versiones`),
  version: (versionId) => req(`/api/reportes/versiones/${versionId}`),
  compararVersiones: (a, b) => req(`/api/reportes/versiones/${a}/comparar/${b}`),

  /** Modo diseño: descubre las columnas que devuelve una consulta. */
  descubrirColumnas: (payload) => post('/api/reportes/columnas/descubrir', payload),

  // --- Portabilidad (migración de reportes entre instalaciones) ---
  /** Revisa un bundle antes de importarlo; no guarda nada. */
  analizarDefinicion: (bundle) => post('/api/reportes/definicion/analizar', { bundle }),
  importarDefinicion: (bundle, carpetaId) =>
    post('/api/reportes/importar', { bundle, carpetaId }),
  /** Descarga la definición de un reporte como archivo .json. */
  async exportarDefinicion(id) {
    const res = await fetch(`/api/reportes/${id}/definicion`, { credentials: 'include' });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(msg.error || 'Falló la exportación de la definición');
    }
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
  ejecutar: (id, payload) => post(`/api/reportes/${id}/ejecutar`, payload),
  enviar: (id, payload) => post(`/api/reportes/${id}/enviar`, payload),

  /** Descarga binaria: dispara el "Guardar como" del navegador. */
  async exportar(id, payload) {
    const res = await fetch(`/api/reportes/${id}/exportar`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Fallo la exportación');
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
