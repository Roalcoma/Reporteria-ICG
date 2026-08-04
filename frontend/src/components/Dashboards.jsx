import { useEffect, useState } from 'react';
import { api } from '../api';
import DashboardEditor from './DashboardEditor';

const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE') : '—');

const VISIBILIDAD = {
  PRIVADO:  { texto: 'Privado',   clase: '' },
  PERFIL:   { texto: 'Por perfil', clase: 'gestion' },
  USUARIOS: { texto: 'Compartido', clase: 'gestion' },
  PUBLICO:  { texto: 'Público',   clase: 'contable' }
};

/**
 * Dashboards del usuario y los que le han compartido.
 * Quien tenga permiso de autogestión puede crear los suyos.
 */
export default function Dashboards({ permisos }) {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(undefined);   // undefined = ninguno; null = nuevo
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const puedeCrear = !!(permisos?.PuedeCrearDashboards || permisos?.PuedeAdministrar);

  const recargar = () => api.dashboards().then(setLista).catch(e => setError(e.message));
  useEffect(() => { recargar(); }, []);

  if (abierto !== undefined) {
    return (
      <DashboardEditor
        dashboardId={abierto}
        puedeCrear={puedeCrear}
        onVolver={() => { setAbierto(undefined); recargar(); }}
        onGuardado={(id) => setAbierto(id)} />
    );
  }

  const eliminar = async (d) => {
    if (!confirm(`¿Eliminar el dashboard "${d.Nombre}"?`)) return;
    try { await api.eliminarDashboard(d.DashboardId); recargar(); }
    catch (e) { setError(e.message); }
  };

  const visibles = lista.filter(d =>
    !busqueda || d.Nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const mios = visibles.filter(d => d.EsPropio);
  const compartidos = visibles.filter(d => !d.EsPropio);

  const Tabla = ({ filas, titulo, vacio }) => (
    <>
      <h3>{titulo} ({filas.length})</h3>
      <div className="grid-wrap" style={{ marginBottom: 14 }}>
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Nombre</th><th>Descripción</th><th>Autor</th>
                  <th>Visibilidad</th><th>Actualizado</th><th></th></tr>
            </thead>
            <tbody>
              {filas.map(d => {
                const v = VISIBILIDAD[d.Visibilidad] || VISIBILIDAD.PRIVADO;
                return (
                  <tr key={d.DashboardId}>
                    <td><strong>{d.Nombre}</strong></td>
                    <td className="trunc">{d.Descripcion || ''}</td>
                    <td>{d.LoginICG || '—'}</td>
                    <td><span className={`badge ${v.clase}`}>{v.texto}</span></td>
                    <td>{fecha(d.FechaActualizacion || d.FechaCreacion)}</td>
                    <td>
                      <div className="acciones-fila">
                        <button onClick={() => setAbierto(d.DashboardId)}>Abrir</button>
                        {d.EsPropio && <button onClick={() => eliminar(d)}>Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filas.length && <tr><td colSpan={6} className="muted">{vacio}</td></tr>}
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
          <h2>Dashboards</h2>
          <p className="muted">
            Arma tus propios paneles eligiendo campos del catálogo. No hace falta escribir SQL.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {puedeCrear && (
          <button className="primary" onClick={() => setAbierto(null)}>+ Nuevo dashboard</button>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      <div className="filtros">
        <label className="param" style={{ minWidth: 260 }}>
          <span>Buscar</span>
          <input type="search" value={busqueda} placeholder="nombre del dashboard"
                 onChange={e => setBusqueda(e.target.value)} />
        </label>
      </div>

      <Tabla filas={mios} titulo="Mis dashboards"
             vacio={puedeCrear
               ? 'Todavía no has creado ninguno.'
               : 'No tienes dashboards propios.'} />
      <Tabla filas={compartidos} titulo="Compartidos conmigo"
             vacio="Nadie te ha compartido un dashboard." />
    </div>
  );
}
