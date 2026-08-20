/** Historial de versiones de ICG Reportería (frontend-vue). */

export const APP_VERSION = '0.3.5';

export const VERSIONES = [
  {
    version: '0.3.5',
    fecha: '2026-08-11',
    cambios: [
      'Excel: logo reducido a 2 filas × 34pt (≈90px), elimina espacio vacío bajo el logo',
      'Excel: muestra dirección/RUC/teléfono en filas adicionales (lineasHtml, hasta 4 líneas)',
      'exportService: primerLineaHtml() reemplazado por lineasHtml() que devuelve array',
      'CSV: empresa también usa lineasHtml()[0] en vez de lógica inline',
    ],
  },
  {
    version: '0.3.4',
    fecha: '2026-08-11',
    cambios: [
      'Excel: nombre empresa ahora usa primerLineaHtml(encabezadoHtml) — primera línea no vacía del HTML (nombre completo, sin truncar)',
      'Excel: logo redimensionado a 240×90px; espacio ampliado a 4 filas de 28pt (~150px total)',
      'exportService: nuevo helper primerLineaHtml() que trata tags de bloque como saltos de línea',
    ],
  },
  {
    version: '0.3.3',
    fecha: '2026-08-11',
    cambios: [
      'brandingService.getBranding(): agrega e.Nombre al SELECT y lo expone como branding.nombre (campo limpio de BD)',
      'Excel: usa branding.nombre directamente en vez de parsear encabezadoHtml (evita texto basura)',
      'Excel: logo embebido a 180×70px con filas de altura 25pt para que no aparezca como miniatura',
      'Excel: sin logo → nombre empresa en bold 14pt; con logo → bold 11pt debajo del logo',
    ],
  },
  {
    version: '0.3.2',
    fecha: '2026-08-11',
    cambios: [
      'Excel: branding ahora se carga también para formato EXCEL (fix: solo se cargaba para HTML/PDF)',
      'Excel: logo embebido con addImage cuando existe en el branding (png/jpeg/gif)',
      'Excel: se muestran todas las líneas de encabezadoHtml (empresa, dirección, RUC…) no solo la primera',
      'Botones de exportación: estado de carga por formato (exportandoFormato), doble-clic bloqueado',
    ],
  },
  {
    version: '0.3.1',
    fecha: '2026-08-11',
    cambios: [
      'Fix: race condition en connectionManager — getConfigPool/getGeneralPool/getDataPool almacenan la Promise antes de awaitar para que llamadas concurrentes compartan la misma conexión y no generen pools huérfanos',
      'Fix: eliminarRelacion en catalogoAdminService usaba una segunda llamada redundante a getConfigPool en vez del pool ya obtenido',
    ],
  },
  {
    version: '0.3.0',
    fecha: '2026-08-11',
    cambios: [
      'Exportaciones Excel y CSV ahora incluyen cabecera con empresa, nombre del reporte y fecha de generación',
      'Nuevo endpoint GET/POST/PUT /api/correo para gestionar configuraciones SMTP sin editar la BD manualmente',
      'API frontend: correoConfigs(), crearCorreoConfig(), actualizarCorreoConfig()',
    ],
  },
  {
    version: '0.2.0',
    fecha: '2026-01-01',
    cambios: [
      'Versión inicial con módulos de reportes, dashboards, branding, programaciones y portabilidad',
    ],
  },
];

export const COMMITS = [
  { hash: 'HEAD',  version: '0.3.5', mensaje: 'fix: Excel logo 2×34pt sin espacio vacío; lineasHtml() con dirección/RUC/tel' },
  { hash: 'prev5', version: '0.3.4', mensaje: 'fix: Excel primerLineaHtml para nombre completo; logo 240×90 en 4 filas de 28pt' },
  { hash: 'prev4', version: '0.3.3', mensaje: 'fix: Excel usa branding.nombre limpio, logo 180×70, sin parsear encabezadoHtml' },
  { hash: 'prev3', version: '0.3.2', mensaje: 'fix: Excel branding fetch + logo addImage + todas las líneas; spinner en exports' },
  { hash: 'prev2', version: '0.3.1', mensaje: 'fix: race condition en pools de conexión; eliminarRelacion usa pool existente' },
  { hash: 'prev1', version: '0.3.0', mensaje: 'feat: cabecera empresa/reporte en exports Excel y CSV; endpoint SMTP config' },
];
