/** Versión de la aplicación y registro de cambios. */
export const APP_VERSION = '0.7.2';

export const VERSIONES = [
  {
    version: '0.7.2',
    fecha: '2026-09-30',
    cambios: [
      'Feature: DataGrid guarda vista por reporte — orden de columnas, agrupación, alias, totales y formatos persisten en localStorage; botón "Guardar vista" aparece al detectar cambios',
    ],
  },
  {
    version: '0.7.1',
    fecha: '2026-08-28',
    cambios: [
      'Fix: parámetro repetido en SQL ya no lanza "already been declared" — queryTemplateEngine registra request.input() una sola vez por nombre',
    ],
  },
  {
    version: '0.7.0',
    fecha: '2026-08-27',
    cambios: [
      'Feature: editor SQL con CodeMirror 6 — syntax highlighting SQL en SqlEditor.vue',
      'Feature: Procedimientos — dos tabs (Stored Procedures y Vistas) con lista + editor de definición',
      'Backend: GET /api/procedimientos/empresa/sps, /vistas, /definicion — lista y lectura de SPs/Vistas en BD empresa',
      'Backend: PUT /api/procedimientos/empresa/alterar — executa ALTER PROCEDURE/VIEW con validación de prefijo',
      'API: empresaSps, empresaVistas, empresaDefinicion, empresaAlterar en api.js',
      'Feature: ReporteEditor usa SqlEditor (CodeMirror 6) en lugar de textarea para los campos SQL — syntax highlighting en consulta principal, cabecera, detalle y LISTA_SQL de parámetros',
      'Fix: eliminar reporte ahora muestra toast de confirmación tras borrado exitoso',
      'Fix: AppModal crash en mount — useModalStore() retorna proxy reactivo; acceder ms.state directamente (no destructurar ref)',
      'Fix: import corrompido @/stores/ms.state.js → @/stores/modal.js restaurado',
      'Feature: Procedimientos — filtro por esquema con chips, badges de tipo, fechas y conteos',
    ],
  },
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
  { version: '0.7.2', mensaje: 'feat: persistir vista de DataGrid (orden/agrupado/formatos) en localStorage' },
  { version: '0.7.0', mensaje: 'feat: editor SQL CodeMirror 6 + módulo Procedimientos (SPs y Vistas)' },
  { version: '0.4.0', mensaje: 'feat: módulo actualización automática desde GitHub Releases' },
  { version: '0.3.0', mensaje: 'feat: módulo auditoría UI + cobertura audit programaciones' },
];
