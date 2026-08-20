/** Versión de la aplicación y registro de cambios. */
export const APP_VERSION = '0.6.0';

export const VERSIONES = [
  {
    version: '0.6.0',
    fecha: '2026-08-20',
    cambios: [
      'Fix: login ELOGIN — dotenv anclado con __dirname para evitar carga de .env incorrecto',
      'Fix: toasts no desaparecían — storeToRefs en AppToasts para mantener reactividad',
      'Fix: Lista dinámica (SQL) sin resultados en reportes GESTIÓN — seleccion.codEmpresa ahora toma la empresa de sesión',
      'Feature: asistente "Usar tabla ICG" en parámetros LISTA_SQL — chips de tablas comunes + búsqueda dinámica vía INFORMATION_SCHEMA',
      'Backend: GET /api/reportes/tablas-icg/catalogo y /columnas para el asistente de tabla',
    ],
  },
  {
    version: '0.5.0',
    fecha: '2026-08-13',
    cambios: [
      'Branding Redes IP aplicado a toda la aplicación',
      'Paleta de colores: verde #86BB25 como primario, #555652 secundario, #202020 texto oscuro',
      'Sidebar: fondo #202020, logo Redes IP (1.png), barra activa verde',
      'Login: logo Redes IP (5.png), subtítulo "ICG Reportería"',
      'tokens.css: todos los tokens azules reemplazados por la paleta Redes IP',
      'Modo oscuro actualizado con verde #A5D145 y fondos Redes IP',
    ],
  },
  {
    version: '0.4.0',
    fecha: '2026-08-12',
    cambios: [
      'Módulo de actualización automática desde GitHub Releases',
      'Backend: actualizacionService — consulta releases API, descarga ZIP, extrae con PowerShell',
      'Backend: GET /api/actualizacion/check (requireAuth), POST /api/actualizacion/aplicar (requireAdmin)',
      'Frontend: ActualizacionView — muestra versión local vs. remota, badge Al día / Actualización disponible',
      'Frontend: botón "Descargar e instalar" con spinner, aviso de backup, mensaje de éxito/error',
      'Sidebar y router: enlace /actualizacion visible solo a administradores',
    ],
  },
  {
    version: '0.3.0',
    fecha: '2026-08-11',
    cambios: [
      'Vista de Auditoría completa: estadísticas KPI, top reportes, bitácora con filtros',
      'Filtros de bitácora: tipo, usuario (texto), fecha desde/hasta, exitoso',
      'Badges de colores por tipo de evento; paginación "Cargar más"',
      'API: nuevo método auditoriaTipos(); filtros login y exitoso en auditoriaEventos()',
      'Backend: auditoría PROGRAMACION_CREAR / CAMBIAR / ELIMINAR en programaciones.routes.js',
      'auditoriaService: filtros login (LIKE) y exitoso añadidos a consultar()',
    ],
  },
];

export const COMMITS = [
  { version: '0.4.0', mensaje: 'feat: módulo actualización automática desde GitHub Releases' },
  { version: '0.3.0', mensaje: 'feat: módulo auditoría UI + cobertura audit programaciones' },
];
