import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Icono from './Icono';

/** Distintivo visual por tipo de reporte: icono + color + etiqueta. */
export const TIPO_INFO = {
  SIMPLE:        { icono: 'reporte', etiqueta: 'Simple',     clase: 'tipo-simple' },
  MASTER_DETAIL: { icono: 'capas',   etiqueta: 'Multinivel', clase: 'tipo-multinivel' },
  DASHBOARD:     { icono: 'panel',   etiqueta: 'Dashboard',  clase: 'tipo-dashboard' }
};
const info = (tipo) => TIPO_INFO[tipo] || TIPO_INFO.SIMPLE;

/**
 * Navegador lateral: carpetas (grupos/subgrupos) con sus reportes.
 * Incluye buscador, distintivo por tipo y gestión de carpetas y reportes.
 */
export default function ArbolReportes({ seleccionado, onSeleccionar, permisos, onCambio }) {
  const [carpetas, setCarpetas] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [abiertas, setAbiertas] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);

  const puedeEditar = !!(permisos?.PuedeCrear || permisos?.PuedeEditar);

  const cargar = () =>
    Promise.all([api.carpetas(), api.reportes()])
      .then(([c, r]) => {
        setCarpetas(c); setReportes(r);
        setAbiertas(a => ({ ...Object.fromEntries(c.map(x => [x.CarpetaId, true])), ...a }));
      })
      .catch(e => setError(e.message));

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return reportes;
    return reportes.filter(r =>
      r.Nombre.toLowerCase().includes(q) ||
      (r.Descripcion || '').toLowerCase().includes(q) ||
      info(r.Tipo).etiqueta.toLowerCase().includes(q));
  }, [reportes, busqueda]);

  const buscando = busqueda.trim().length > 0;
  const hijas = (padreId) => carpetas.filter(c => (c.CarpetaPadreId ?? null) === padreId);
  const deCarpeta = (id) => filtrados.filter(r => r.CarpetaId === id);
  const sueltos = filtrados.filter(r => r.CarpetaId == null);

  // Al buscar, se ocultan las carpetas que no contienen ninguna coincidencia.
  const carpetaTieneCoincidencias = (id) => {
    if (deCarpeta(id).length) return true;
    return hijas(id).some(h => carpetaTieneCoincidencias(h.CarpetaId));
  };

  const accion = async (fn) => {
    setError(null);
    try { await fn(); await cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
  };

  const nuevaCarpeta = (padreId = null) => {
    const nombre = prompt(padreId ? 'Nombre de la subcarpeta:' : 'Nombre de la carpeta:');
    if (nombre && nombre.trim()) {
      accion(() => api.crearCarpeta({ Nombre: nombre.trim(), CarpetaPadreId: padreId }));
    }
  };

  const renombrarCarpeta = (c) => {
    const nombre = prompt('Nuevo nombre:', c.Nombre);
    if (nombre && nombre.trim() && nombre !== c.Nombre) {
      accion(() => api.actualizarCarpeta(c.CarpetaId,
        { Nombre: nombre.trim(), CarpetaPadreId: c.CarpetaPadreId, Orden: c.Orden }));
    }
  };

  const borrarCarpeta = (c) => {
    if (!confirm(`¿Eliminar la carpeta "${c.Nombre}"?`)) return;
    accion(() => api.eliminarCarpeta(c.CarpetaId));
  };

  const duplicar = (r) => {
    const nombre = prompt('Nombre del duplicado:', `${r.Nombre} (copia)`);
    if (nombre && nombre.trim()) {
      accion(async () => {
        const nuevo = await api.duplicarReporte(r.ReporteId, { nombre: nombre.trim() });
        onSeleccionar(nuevo.ReporteId);
      });
    }
  };

  const borrarReporte = (r) => {
    if (!confirm(`¿Eliminar el reporte "${r.Nombre}"?\n\nSe conserva su historial para auditoría.`)) return;
    accion(async () => {
      await api.eliminarReporte(r.ReporteId);
      if (seleccionado === r.ReporteId) onSeleccionar(null);
    });
  };

  const FilaReporte = ({ r, sangria }) => {
    const t = info(r.Tipo);
    return (
      <li key={r.ReporteId}>
        <div className={`reporte ${seleccionado === r.ReporteId ? 'activo' : ''}`}
             style={{ paddingLeft: sangria }}
             onClick={() => onSeleccionar(r.ReporteId)}
             title={`${t.etiqueta}${r.Descripcion ? ' — ' + r.Descripcion : ''}`}>
          <span className={`tipo-icono ${t.clase}`}><Icono nombre={t.icono} /></span>
          <span className="reporte-nombre">{r.Nombre}</span>
          <span className={`tipo-tag ${t.clase}`}>{t.etiqueta}</span>
          {puedeEditar && (
            <span className="reporte-acciones">
              <button title="Duplicar" onClick={e => { e.stopPropagation(); duplicar(r); }}>
                <Icono nombre="duplicar" titulo="Duplicar" />
              </button>
              <button title="Eliminar" onClick={e => { e.stopPropagation(); borrarReporte(r); }}>
                <Icono nombre="eliminar" titulo="Eliminar" />
              </button>
            </span>
          )}
        </div>
      </li>
    );
  };

  const Nodo = ({ carpeta, nivel }) => {
    if (buscando && !carpetaTieneCoincidencias(carpeta.CarpetaId)) return null;
    const abierta = buscando || abiertas[carpeta.CarpetaId];
    return (
      <li>
        <div className="carpeta" style={{ paddingLeft: nivel * 12 }}>
          <span className="carpeta-titulo"
                onClick={() => setAbiertas(a => ({ ...a, [carpeta.CarpetaId]: !a[carpeta.CarpetaId] }))}>
            <span aria-hidden="true">{abierta ? '▾' : '▸'}</span>
            <Icono nombre="carpeta" />
            {carpeta.Nombre}
          </span>
          {puedeEditar && (
            <span className="reporte-acciones">
              <button title="Nueva subcarpeta"
                      onClick={e => { e.stopPropagation(); nuevaCarpeta(carpeta.CarpetaId); }}>
                <Icono nombre="añadir" titulo="Nueva subcarpeta" />
              </button>
              <button title="Renombrar"
                      onClick={e => { e.stopPropagation(); renombrarCarpeta(carpeta); }}>
                <Icono nombre="editar" titulo="Renombrar" />
              </button>
              <button title="Eliminar carpeta"
                      onClick={e => { e.stopPropagation(); borrarCarpeta(carpeta); }}>
                <Icono nombre="eliminar" titulo="Eliminar carpeta" />
              </button>
            </span>
          )}
        </div>
        {abierta && (
          <ul>
            {hijas(carpeta.CarpetaId).map(h => <Nodo key={h.CarpetaId} carpeta={h} nivel={nivel + 1} />)}
            {deCarpeta(carpeta.CarpetaId).map(r =>
              <FilaReporte key={r.ReporteId} r={r} sangria={(nivel + 1) * 12 + 14} />)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav className="arbol">
      <div className="arbol-cab">
        <h3>Reportes</h3>
        {puedeEditar && (
          <button className="btn-mini" title="Nueva carpeta" onClick={() => nuevaCarpeta(null)}>
            <Icono nombre="carpeta" titulo="Nueva carpeta" />
            <Icono nombre="añadir" tam={12} />
          </button>
        )}
      </div>

      <input className="buscador" type="search" value={busqueda} placeholder="Buscar reporte…"
             onChange={e => setBusqueda(e.target.value)} />
      {buscando && (
        <p className="muted resultado-busqueda">
          {filtrados.length} resultado{filtrados.length === 1 ? '' : 's'}
        </p>
      )}

      {error && <div className="error">{error}</div>}

      <ul>
        {hijas(null).map(c => <Nodo key={c.CarpetaId} carpeta={c} nivel={0} />)}
        {sueltos.map(r => <FilaReporte key={r.ReporteId} r={r} sangria={4} />)}
      </ul>

      {!carpetas.length && !reportes.length && <p className="muted">Sin reportes aún.</p>}
      {buscando && !filtrados.length && <p className="muted">Ningún reporte coincide.</p>}
    </nav>
  );
}
