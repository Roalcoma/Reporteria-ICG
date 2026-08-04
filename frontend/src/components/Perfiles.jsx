import { useEffect, useState } from 'react';
import { api } from '../api';
import { TIPO_INFO } from './ArbolReportes';

const info = (t) => TIPO_INFO[t] || TIPO_INFO.SIMPLE;

/**
 * Perfiles de reporte: agrupan reportes y se asignan a usuarios.
 * Modificar el perfil alcanza a todos sus usuarios de una vez.
 */
export default function Perfiles() {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null);        // perfil abierto (detalle)
  const [reportes, setReportes] = useState([]);
  const [marcados, setMarcados] = useState(new Set());
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [filtro, setFiltro] = useState('');

  const recargar = () => api.perfiles().then(setLista).catch(e => setError(e.message));
  useEffect(() => { recargar(); api.reportes().then(setReportes).catch(() => {}); }, []);

  const abrir = async (p) => {
    setError(null); setOk(null);
    try {
      const d = await api.perfil(p.PerfilId);
      setSel(d);
      setMarcados(new Set(d.reportes.map(r => r.ReporteId)));
    } catch (e) { setError(e.message); }
  };

  const crear = async () => {
    const nombre = prompt('Nombre del perfil (ej. Contable, Gerencia de tienda):');
    if (!nombre || !nombre.trim()) return;
    try {
      await api.crearPerfil({ nombre: nombre.trim(), descripcion: null });
      setOk(`Perfil "${nombre.trim()}" creado.`);
      recargar();
    } catch (e) { setError(e.message); }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar el perfil "${p.Nombre}"?\n\n` +
      `Los ${p.Usuarios} usuario(s) asignados dejarán de tenerlo.`)) return;
    try {
      await api.eliminarPerfil(p.PerfilId);
      if (sel?.perfil?.PerfilId === p.PerfilId) setSel(null);
      setOk('Perfil eliminado.'); recargar();
    } catch (e) { setError(e.message); }
  };

  const alternarReporte = (id) => setMarcados(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const guardarReportes = async () => {
    setError(null); setOk(null);
    try {
      await api.setReportesDePerfil(sel.perfil.PerfilId, [...marcados]);
      setOk(`Perfil "${sel.perfil.Nombre}" actualizado: ${marcados.size} reporte(s). ` +
        `El cambio ya aplica a todos sus usuarios.`);
      recargar();
      abrir(sel.perfil);
    } catch (e) { setError(e.message); }
  };

  const visibles = reportes.filter(r =>
    !filtro || r.Nombre.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>Perfiles de reporte</h2>
          <p className="muted">
            Agrupa reportes en un perfil y asígnalo a los usuarios. Al cambiar el
            perfil, el cambio alcanza de inmediato a todos: no hay que tocarlos uno por uno.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="primary" onClick={crear}>+ Nuevo perfil</button>
      </header>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      <div className="aviso">
        Un usuario <strong>sin perfiles</strong> ve todos los reportes. En cuanto se le
        asigna al menos uno, solo verá los de sus perfiles. Los administradores siempre ven todo.
      </div>

      <h3>Perfiles ({lista.length})</h3>
      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Perfil</th><th>Descripción</th><th className="num">Reportes</th>
                  <th className="num">Usuarios</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.PerfilId} className={sel?.perfil?.PerfilId === p.PerfilId ? 'fila-activa' : ''}>
                  <td><strong>{p.Nombre}</strong></td>
                  <td className="trunc">{p.Descripcion || ''}</td>
                  <td className="num">{p.Reportes}</td>
                  <td className="num">{p.Usuarios}</td>
                  <td><span className={`badge ${p.Activo ? 'gestion' : 'contable'}`}>
                    {p.Activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <div className="acciones-fila">
                      <button onClick={() => abrir(p)}>Editar reportes</button>
                      <button onClick={() => eliminar(p)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!lista.length && (
                <tr><td colSpan={6} className="muted">
                  Ningún perfil todavía. Crea uno para agrupar reportes por tipo de usuario.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sel && (
        <>
          <h3>
            Reportes del perfil «{sel.perfil.Nombre}» — {marcados.size} seleccionado(s)
          </h3>
          <div className="filtros">
            <label className="param" style={{ minWidth: 260 }}>
              <span>Buscar reporte</span>
              <input value={filtro} onChange={e => setFiltro(e.target.value)}
                     placeholder="nombre del reporte" />
            </label>
            <button className="primary" onClick={guardarReportes}>Guardar reportes del perfil</button>
            <button onClick={() => setSel(null)}>Cerrar</button>
          </div>

          <div className="grid-wrap">
            <div className="grid-scroll">
              <table className="grid">
                <thead>
                  <tr><th></th><th>Reporte</th><th>Tipo</th><th>Área</th></tr>
                </thead>
                <tbody>
                  {visibles.map(r => {
                    const t = info(r.Tipo);
                    return (
                      <tr key={r.ReporteId}>
                        <td>
                          <input type="checkbox" checked={marcados.has(r.ReporteId)}
                                 onChange={() => alternarReporte(r.ReporteId)} />
                        </td>
                        <td>{r.Nombre}</td>
                        <td><span className={`tipo-tag ${t.clase}`}>{t.icono} {t.etiqueta}</span></td>
                        <td>
                          <span className={`badge ${r.Area === 'CONTABLE' ? 'contable' : 'gestion'}`}>
                            {r.Area}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibles.length && (
                    <tr><td colSpan={4} className="muted">Sin reportes que mostrar.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sel.usuarios.length > 0 && (
            <p className="muted">
              Usuarios con este perfil: {sel.usuarios.map(u => u.LoginICG || u.CodUsuarioICG).join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
