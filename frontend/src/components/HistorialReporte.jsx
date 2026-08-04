import { useEffect, useState } from 'react';
import { api } from '../api';

const fecha = (v) => (v ? new Date(v).toLocaleString('es-VE') : '—');

/**
 * Evolución de un reporte en el tiempo: línea de versiones (quién cambió qué y
 * cuándo), comparación entre dos versiones y quién ha consultado el reporte.
 */
export default function HistorialReporte({ reporteId, onCerrar }) {
  const [versiones, setVersiones] = useState([]);
  const [ejecuciones, setEjecuciones] = useState([]);
  const [sel, setSel] = useState([]);          // ids a comparar (máx. 2)
  const [comparacion, setComparacion] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.versiones(reporteId).then(setVersiones).catch(e => setError(e.message));
    api.ejecucionesDe(reporteId).then(setEjecuciones).catch(() => {});
  }, [reporteId]);

  const alternar = (id) => {
    setComparacion(null);
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id].slice(-2)));
  };

  const comparar = async () => {
    if (sel.length !== 2) return;
    try {
      // Se compara de la más antigua a la más reciente.
      const orden = versiones.filter(v => sel.includes(v.ReporteVersionId))
        .sort((a, b) => new Date(a.FechaCambio) - new Date(b.FechaCambio));
      setComparacion(await api.compararVersiones(
        orden[0].ReporteVersionId, orden[1].ReporteVersionId));
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="viewer">
      <header className="viewer-head">
        <h2>Evolución del reporte</h2>
        <div style={{ flex: 1 }} />
        <button onClick={onCerrar}>Volver</button>
      </header>

      {error && <div className="error">{error}</div>}

      <h3>Versiones ({versiones.length})</h3>
      <div className="grid-toolbar">
        <button className="primary" onClick={comparar} disabled={sel.length !== 2}>
          Comparar seleccionadas ({sel.length}/2)
        </button>
        <span className="muted">Marca dos versiones para ver las diferencias.</span>
      </div>

      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th></th><th>Ver.</th><th>Acción</th><th>Nombre</th>
                  <th>Usuario</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {versiones.map(v => (
                <tr key={v.ReporteVersionId}>
                  <td><input type="checkbox" checked={sel.includes(v.ReporteVersionId)}
                             onChange={() => alternar(v.ReporteVersionId)} /></td>
                  <td className="num">{v.Version}</td>
                  <td><span className={`badge ${v.Accion === 'ELIMINAR' ? 'contable' : 'gestion'}`}>
                    {v.Accion}</span></td>
                  <td>{v.NombreReporte}</td>
                  <td>{v.LoginICG || '—'}</td>
                  <td>{fecha(v.FechaCambio)}</td>
                </tr>
              ))}
              {!versiones.length && (
                <tr><td colSpan={6} className="muted">Sin historial todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {comparacion && <Comparacion c={comparacion} />}

      <h3>Consultas recientes ({ejecuciones.length})</h3>
      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Fecha</th><th>Usuario</th><th className="num">Filas</th>
                  <th className="num">Duración</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {ejecuciones.map(e => (
                <tr key={e.EjecucionId}>
                  <td>{fecha(e.FechaEjecucion)}</td>
                  <td>{e.LoginICG || '—'}</td>
                  <td className="num">{e.FilasResultado ?? ''}</td>
                  <td className="num">{e.DuracionMs != null ? `${e.DuracionMs} ms` : ''}</td>
                  <td className={e.Estado === 'OK' ? 'ok' : 'estado-error'}>{e.Estado}</td>
                </tr>
              ))}
              {!ejecuciones.length && (
                <tr><td colSpan={5} className="muted">Nadie lo ha consultado aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Comparacion({ c }) {
  return (
    <>
      <h3>
        Cambios entre v{c.a.version} ({c.a.usuario || '—'}, {fecha(c.a.fecha)})
        {' → '} v{c.b.version} ({c.b.usuario || '—'}, {fecha(c.b.fecha)})
      </h3>
      {!c.cambios.length ? (
        <p className="muted">No hay diferencias entre estas versiones.</p>
      ) : c.cambios.map((ch, i) => (
        <div key={i} className="cambio">
          <div className="cambio-cab">
            <span className="badge gestion">{ch.ambito}</span> <strong>{ch.clave}</strong>
          </div>
          {ch.diff ? (
            <pre className="diff">
              {ch.diff.map((l, j) => (
                <div key={j} className={l.tipo === '+' ? 'linea-mas' : 'linea-menos'}>
                  {l.tipo} {l.texto}
                </div>
              ))}
            </pre>
          ) : (
            <div className="cambio-valores">
              <span className="linea-menos">− {String(ch.antes ?? '(vacío)')}</span>
              <span className="linea-mas">+ {String(ch.despues ?? '(vacío)')}</span>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
