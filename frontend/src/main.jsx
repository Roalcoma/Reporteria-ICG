/**
 * Punto de entrada del frontend. Lo carga index.html como módulo y no hace más
 * que montar <App> sobre #root.
 *
 * `styles.css` se importa aquí, una sola vez para toda la aplicación, y su
 * primera línea es `@import './tokens.css'`: los tokens de diseño (color,
 * espaciado, tipografía, tema claro/oscuro) deben quedar definidos ANTES que
 * cualquier regla que los use. Los componentes no importan CSS por su cuenta.
 *
 * StrictMode solo actúa en desarrollo: monta cada componente dos veces para
 * destapar efectos sin limpieza. Si algo se duplica al desarrollar y no en
 * producción —una petición que sale dos veces—, la causa suele ser un efecto
 * sin función de limpieza, no un fallo de StrictMode.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
