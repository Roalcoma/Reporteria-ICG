import { useEffect, useState } from 'react';
import { api } from '../api';
import OrigenEditor from './OrigenEditor';

const CARDINALIDADES = [
  { id: 'N1', nombre: 'muchos a uno (enriquecer)', ayuda: 'No multiplica importes. Ej.: ventas → artículos.' },
  { id: 'NN', nombre: 'muchos a muchos', ayuda: 'El motor agrega cada lado por separado para no inflar totales.' }
];

/**
 * Catálogo de orígenes de datos. Solo accesible al SUPERVISOR.
 * Los orígenes del paquete base son de solo lectura: para variarlos se duplican.
 *
 * PROPIEDAD DEL CATÁLOGO. Los orígenes de ICG-BASE se entregan con la
 * herramienta y nuestras actualizaciones pueden corregirlos —así llegó la
 * corrección de FACTORMONEDA a todos los clientes—. Por eso no se editan: quien
 * necesite una variante la duplica y obtiene una copia propia, que ninguna
 * actualización volverá a tocar.
 *
 * CARDINALIDAD DE LAS RELACIONES. Es el ajuste con más consecuencias de esta
 * pantalla y el más fácil de equivocar:
 *
 *   N1 (muchos a uno)  → enriquecer. Ventas hacia artículos: cada venta tiene un
 *                        artículo, así que unir no multiplica filas y el motor
 *                        puede hacer JOIN directo.
 *   NN (muchos a muchos) → el motor agrega CADA LADO POR SEPARADO antes de unir.
 *                        Es lo que evita el fan-out: sin esto, cruzar ventas con
 *                        existencias repetiría cada venta por cada fila de stock
 *                        e inflaría los importes sin ningún aviso.
 *
 * Declarar como N1 algo que en realidad es NN produce cifras infladas que nadie
 * detecta hasta contrastarlas contra ICG. Ante la duda, NN: es más lento, pero
 * nunca miente.
 */
export default function Origenes() {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(undefined);   // undefined = ninguno; null = nuevo
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [rel, setRel] = useState({ origenIzq: '', campoIzq: '', origenDer: '', campoDer: '', cardinalidad: 'N1' });

  const recargar = () => {
    api.origenes().then(setLista).catch(e => setError(e.message));
    api.catalogoDashboards().then(setCatalogo).catch(() => {});
  };
  useEffect(() => { recargar(); }, []);

  if (abierto !== undefined) {
    return (
      <OrigenEditor
        origenId={abierto}
        onVolver={() => { setAbierto(undefined); recargar(); }}
        onGuardado={(id) => { setAbierto(id); recargar(); }} />
    );
  }

  const accion = async (fn, mensaje) => {
    setError(null); setOk(null);
    try { await fn(); setOk(mensaje); recargar(); }
    catch (e) { setError(e.message); }
  };

  const duplicar = (o) => {
    const clave = prompt('Clave del nuevo origen:', `${o.Clave}_MIO`);
    if (!clave || !clave.trim()) return;
    accion(async () => {
      const r = await api.duplicarOrigen(o.OrigenId,
        { clave: clave.trim().toUpperCase(), nombre: `${o.Nombre} (personalizado)` });
      setAbierto(r.OrigenId);
    }, `Duplicado como ${clave.trim().toUpperCase()}`);
  };

  const eliminar = async (o) => {
    if (!confirm(`¿Eliminar el origen "${o.Clave}"?`)) return;
    try {
      await api.eliminarOrigen(o.OrigenId);
      setOk('Origen eliminado.'); recargar();
    } catch (e) {
      // El backend avisa si hay dashboards que lo usan; se pide confirmación.
      if (/dashboard/i.test(e.message) &&
          confirm(`${e.message}\n\n¿Eliminarlo de todos modos?`)) {
        accion(() => api.eliminarOrigen(o.OrigenId, true), 'Origen eliminado.');
      } else setError(e.message);
    }
  };

  const camposDe = (clave) =>
    (catalogo?.origenes || []).find(o => o.clave === clave)?.campos || [];

  const crearRelacion = () => accion(
    () => api.crearRelacion(rel),
    `Relación creada: ${rel.origenIzq}.${rel.campoIzq} → ${rel.origenDer}.${rel.campoDer}`);

  const base = lista.filter(o => !o.EsPropio);
  const propios = lista.filter(o => o.EsPropio);

  const Tabla = ({ filas, titulo, ayuda }) => (
    <>
      <h3>{titulo} ({filas.length})</h3>
      {ayuda && <p className="muted" style={{ margin: '0 0 6px' }}>{ayuda}</p>}
      <div className="grid-wrap" style={{ marginBottom: 14 }}>
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Clave</th><th>Nombre</th><th>Tipo</th><th className="num">Campos</th>
                  <th className="num">En uso</th><th>Versión</th><th></th></tr>
            </thead>
            <tbody>
              {filas.map(o => (
                <tr key={o.OrigenId}>
                  <td><code>{o.Clave}</code>{!o.EsPropio && ' 🔒'}</td>
                  <td>{o.Nombre}</td>
                  <td>
                    <span className={`badge ${o.Tipo === 'HECHOS' ? 'gestion' : 'contable'}`}>
                      {o.Tipo === 'HECHOS' ? 'Hechos' : 'Dimensión'}
                    </span>
                  </td>
                  <td className="num">{o.Campos}</td>
                  <td className="num" title="Dashboards que lo usan">
                    {o.DashboardsQueLoUsan ?? 0}
                  </td>
                  <td className="num">v{o.Version}</td>
                  <td>
                    <div className="acciones-fila">
                      <button onClick={() => setAbierto(o.OrigenId)}>
                        {o.EsPropio ? 'Editar' : 'Ver'}
                      </button>
                      <button onClick={() => duplicar(o)}>Duplicar</button>
                      {o.EsPropio && <button onClick={() => eliminar(o)}>Eliminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={7} className="muted">Ninguno todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>Orígenes de datos</h2>
          <p className="muted">
            Lo que los usuarios pueden elegir al armar dashboards. Cada origen expone campos
            con nombres de negocio y esconde el esquema real de ICG.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="primary" onClick={() => setAbierto(null)}>+ Nuevo origen</button>
      </header>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      <Tabla filas={base} titulo="Catálogo base 🔒"
             ayuda="Los publicamos y actualizamos nosotros. No se editan: duplícalos si necesitas una variante." />
      <Tabla filas={propios} titulo="Orígenes propios"
             ayuda="Creados en esta instalación. Ninguna actualización nuestra los modifica." />

      <h3>Relacionar orígenes</h3>
      <p className="muted" style={{ margin: '0 0 6px' }}>
        Las relaciones permiten combinar orígenes en un mismo gráfico. Al menos uno de los
        dos debe ser propio.
      </p>
      <div className="filtros">
        <label className="param">
          <span>Origen</span>
          <select value={rel.origenIzq}
                  onChange={e => setRel(r => ({ ...r, origenIzq: e.target.value, campoIzq: '' }))}>
            <option value="">(elegir)</option>
            {lista.map(o => <option key={o.OrigenId} value={o.Clave}>{o.Clave}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Campo</span>
          <select value={rel.campoIzq} onChange={e => setRel(r => ({ ...r, campoIzq: e.target.value }))}>
            <option value="">(elegir)</option>
            {camposDe(rel.origenIzq).map(c =>
              <option key={c.clave} value={c.nombre}>{c.etiqueta}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Se relaciona con</span>
          <select value={rel.origenDer}
                  onChange={e => setRel(r => ({ ...r, origenDer: e.target.value, campoDer: '' }))}>
            <option value="">(elegir)</option>
            {lista.map(o => <option key={o.OrigenId} value={o.Clave}>{o.Clave}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Campo</span>
          <select value={rel.campoDer} onChange={e => setRel(r => ({ ...r, campoDer: e.target.value }))}>
            <option value="">(elegir)</option>
            {camposDe(rel.origenDer).map(c =>
              <option key={c.clave} value={c.nombre}>{c.etiqueta}</option>)}
          </select>
        </label>
        <label className="param" style={{ minWidth: 220 }}>
          <span>Tipo de relación</span>
          <select value={rel.cardinalidad}
                  onChange={e => setRel(r => ({ ...r, cardinalidad: e.target.value }))}>
            {CARDINALIDADES.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <button className="primary" onClick={crearRelacion}
                disabled={!rel.origenIzq || !rel.campoIzq || !rel.origenDer || !rel.campoDer}>
          Crear relación
        </button>
      </div>
      <p className="muted">
        {CARDINALIDADES.find(c => c.id === rel.cardinalidad)?.ayuda}
      </p>

      {catalogo?.relaciones?.length > 0 && (
        <div className="grid-wrap">
          <div className="grid-scroll" style={{ maxHeight: 220 }}>
            <table className="grid">
              <thead><tr><th>Origen</th><th>Campo</th><th>Se relaciona con</th>
                         <th>Campo</th><th>Tipo</th></tr></thead>
              <tbody>
                {catalogo.relaciones.map((r, i) => (
                  <tr key={i}>
                    <td><code>{r.izq}</code></td><td>{r.campoIzq}</td>
                    <td><code>{r.der}</code></td><td>{r.campoDer}</td>
                    <td><span className="badge">{r.cardinalidad}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
