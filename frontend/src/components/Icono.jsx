/**
 * Iconos SVG del sistema.
 *
 * Sustituyen a los emojis que se usaban antes: un emoji cambia de forma según
 * el sistema operativo, no hereda el color del texto y los lectores de pantalla
 * lo leen como palabra suelta. Estos trazos son consistentes, toman el color
 * del contexto (`currentColor`) y escalan sin perder nitidez.
 *
 * Trazo uniforme de 1.75 sobre una rejilla de 24, al estilo de Lucide.
 */
const TRAZOS = {
  // Navegación y secciones
  panel:      'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  reporte:    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  carpeta:    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  capas:      'm12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  baseDatos:  'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3M21 6v6c0 1.66-4.03 3-9 3s-9-1.34-9-3V6M21 12v6c0 1.66-4.03 3-9 3s-9-1.34-9-3v-6',
  usuarios:   'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  perfiles:   'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 17c0-1.66 1.34-3 3-3h.5M14 9h4M14 13h4M14 17h4',
  escudo:     'M12 2 4 6v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10V6zM9 12l2 2 4-4',
  paleta:     'M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.5-2 4-4 4h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 21M7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2M11 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2M15.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  paquete:    'm7.5 4.27 9 5.15M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.3 12 12l8.7-4.7M12 22V12',
  reloj:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  edificio:   'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V11h4a2 2 0 0 1 2 2v8M9 7h2M9 11h2M9 15h2',
  // Tipos de objeto
  barras:     'M3 3v16a2 2 0 0 0 2 2h16M7 15v3M12 9v9M17 5v13',
  lineas:     'M3 3v16a2 2 0 0 0 2 2h16M7 14l4-4 3 3 5-6',
  torta:      'M21.2 15.9A10 10 0 1 1 8.1 2.8M22 12A10 10 0 0 0 12 2v10z',
  tabla:      'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M3 15h18M9 3v18',
  indicador:  'M4 9h4M4 15h4M14 9h6M14 15h6M9 3v18',
  filtro:     'M3 4h18l-7 8v7l-4 2v-9z',
  calendario: 'M8 2v4M16 2v4M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 11h18',
  // Acciones
  recargar:   'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  editar:     'M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  eliminar:   'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  duplicar:   'M9 9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  añadir:     'M12 5v14M5 12h14',
  cerrar:     'M18 6 6 18M6 6l12 12',
  check:      'm20 6-11 11-5-5',
  buscar:     'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  descargar:  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  correo:     'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 6 9-6',
  reproducir: 'M6 3l14 9-14 9z',
  arrastrar:  'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  enlace:     'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  historial:  'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  salir:      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  // Estado
  aviso:      'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  info:       'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  idea:       'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2',
  candado:    'M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 9V6a4 4 0 1 1 8 0v3',
  sol:        'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  luna:       'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8'
};

/**
 * @param {string} nombre  clave de TRAZOS
 * @param {number} tam     lado en píxeles (16 por defecto)
 * @param {string} titulo  texto accesible; sin él el icono es decorativo
 */
export default function Icono({ nombre, tam = 16, titulo, className = '', ...resto }) {
  const d = TRAZOS[nombre];
  if (!d) return null;
  return (
    <svg className={`icono ${className}`} width={tam} height={tam} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round"
         role={titulo ? 'img' : 'presentation'}
         aria-label={titulo} aria-hidden={titulo ? undefined : 'true'}
         focusable="false" {...resto}>
      {titulo && <title>{titulo}</title>}
      {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={`M${p}`} />)}
    </svg>
  );
}

export const ICONOS = Object.keys(TRAZOS);
