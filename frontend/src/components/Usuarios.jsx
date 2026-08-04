import { useEffect, useState } from 'react';
import { api } from '../api';

const fecha = (v) => (v ? new Date(v).toLocaleString('es-VE') : '—');

/**
 * Administración de roles de reportería.
 * Los usuarios viven en ICG (GENERAL.USUARIOS, solo lectura): aquí solo se
 * decide qué puede hacer cada uno dentro de la herramienta.
 */
export default function Usuarios({ usuarioActual }) {
  const [tab, setTab] = useState('USUARIOS');
  const [lista, setLista] = useState([]);
  const [roles, setRoles] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [soloAsignados, setSoloAsignados] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  // Asignación de perfiles del usuario que se esté editando
  const [perfiles, setPerfiles] = useState([]);
  const [editandoPerfiles, setEditandoPerfiles] = useState(null);
  const [perfilesSel, setPerfilesSel] = useState(new Set());

  const recargar = () => {
    api.usuarios({ filtro, soloAsignados })
      .then(setLista).catch(e => setError(e.message));
    api.usuariosHistorial().then(setHistorial).catch(() => {});
  };

  useEffect(() => {
    api.roles().then(setRoles).catch(() => {});
    api.perfiles().then(setPerfiles).catch(() => {});
  }, []);

  /** Abre el panel de perfiles del usuario con su selección actual. */
  const abrirPerfiles = async (u) => {
    setError(null); setOk(null);
    try {
      const suyos = await api.perfilesDeUsuario(u.codUsuarioICG);
      setPerfilesSel(new Set(suyos.map(p => p.PerfilId)));
      setEditandoPerfiles(u);
    } catch (e) { setError(e.message); }
  };

  const guardarPerfiles = async () => {
    try {
      await api.setPerfilesDeUsuario(
        editandoPerfiles.codUsuarioICG, [...perfilesSel], editandoPerfiles.login);
      setOk(`Perfiles de ${editandoPerfiles.login} actualizados (${perfilesSel.size}).`);
      setEditandoPerfiles(null);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { recargar(); }, [soloAsignados]);

  const accion = async (fn, mensaje) => {
    setError(null); setOk(null);
    try { await fn(); setOk(mensaje); recargar(); }
    catch (e) { setError(e.message); }
  };

  const cambiarRol = (u, appRolId) => {
    if (!appRolId) return accion(
      () => api.quitarRol(u.codUsuarioICG), `Se quitó el rol de ${u.login}`);
    const rol = roles.find(r => r.AppRolId === Number(appRolId));
    accion(() => api.asignarRol(u.codUsuarioICG, Number(appRolId), u.login),
      `${u.login} ahora es ${rol?.Nombre}`);
  };

  const asignados = lista.filter(u => u.usuarioAppId != null).length;

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>Usuarios y roles</h2>
          <p className="muted">
            Los usuarios se gestionan en ICG. Aquí solo se define su rol dentro de
            la reportería. Quien no tenga rol asignado entra como <strong>Lectura</strong>.
          </p>
        </div>
      </header>

      <div className="grid-toolbar" style={{ marginTop: 10 }}>
        <button className={tab === 'USUARIOS' ? 'primary' : ''} onClick={() => setTab('USUARIOS')}>
          Usuarios ({asignados} con rol)
        </button>
        <button className={tab === 'ROLES' ? 'primary' : ''} onClick={() => setTab('ROLES')}>
          Roles ({roles.length})
        </button>
        <button className={tab === 'HISTORIAL' ? 'primary' : ''} onClick={() => setTab('HISTORIAL')}>
          Historial ({historial.length})
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      {editandoPerfiles && (
        <div className="import-preview">
          <div className="import-cab">
            <strong>Perfiles de {editandoPerfiles.login}</strong>
            <span className="muted">
              determinan qué reportes ve; sin ninguno, ve todos
            </span>
          </div>
          {perfiles.length === 0 ? (
            <p className="muted">
              No hay perfiles creados todavía. Créalos en la sección «Perfiles».
            </p>
          ) : (
            <div className="perfiles-check">
              {perfiles.map(p => (
                <label key={p.PerfilId} className="perfil-item">
                  <input type="checkbox" checked={perfilesSel.has(p.PerfilId)}
                         onChange={() => setPerfilesSel(s => {
                           const n = new Set(s);
                           n.has(p.PerfilId) ? n.delete(p.PerfilId) : n.add(p.PerfilId);
                           return n;
                         })} />
                  <span>{p.Nombre}</span>
                  <span className="muted">({p.Reportes} reportes)</span>
                </label>
              ))}
            </div>
          )}
          <div className="acciones">
            <button className="primary" onClick={guardarPerfiles}>Guardar perfiles</button>
            <button onClick={() => setEditandoPerfiles(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {tab === 'USUARIOS' && (
        <>
          <div className="filtros">
            <label className="param">
              <span>Buscar usuario</span>
              <input value={filtro} onChange={e => setFiltro(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && recargar()}
                     placeholder="nombre en ICG" />
            </label>
            <label className="param">
              <span>Mostrar</span>
              <select value={soloAsignados ? '1' : '0'}
                      onChange={e => setSoloAsignados(e.target.value === '1')}>
                <option value="0">Todos los usuarios de ICG</option>
                <option value="1">Solo los que tienen rol</option>
              </select>
            </label>
            <button onClick={recargar}>Buscar</button>
          </div>

          <div className="grid-wrap">
            <div className="grid-scroll">
              <table className="grid">
                <thead>
                  <tr><th>Usuario ICG</th><th>Cód.</th><th>Rol en reportería</th>
                      <th>Estado</th><th>Puede entrar</th><th></th></tr>
                </thead>
                <tbody>
                  {lista.map(u => {
                    const esYo = usuarioActual?.codUsuario === u.codUsuarioICG;
                    return (
                      <tr key={u.codUsuarioICG}>
                        <td>
                          {u.login}
                          {esYo && <span className="muted"> (usted)</span>}
                          {u.esAdminBootstrap && (
                            <span className="badge gestion" title="Administrador fijado en el .env">
                              bootstrap
                            </span>
                          )}
                        </td>
                        <td className="num">{u.codUsuarioICG}</td>
                        <td>
                          <select value={u.appRolId ?? ''}
                                  disabled={esYo || u.esAdminBootstrap}
                                  title={esYo ? 'No puede cambiar su propio rol'
                                    : u.esAdminBootstrap ? 'Definido en el .env del servidor' : ''}
                                  onChange={e => cambiarRol(u, e.target.value)}>
                            <option value="">Lectura (por defecto)</option>
                            {roles.map(r => (
                              <option key={r.AppRolId} value={r.AppRolId}>{r.Nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {u.usuarioAppId == null ? <span className="muted">sin asignar</span> : (
                            <span className={`badge ${u.activo ? 'gestion' : 'contable'}`}>
                              {u.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          )}
                        </td>
                        <td>
                          {u.puedeIniciarSesion
                            ? <span className="ok">✓</span>
                            : <span className="muted" title={u.bloqueado
                                ? 'Bloqueado en ICG' : 'Sin contraseña asignada en ICG'}>
                                ✗ {u.bloqueado ? 'bloqueado' : 'sin clave'}
                              </span>}
                        </td>
                        <td>
                          <div className="acciones-fila">
                            <button onClick={() => abrirPerfiles(u)} title="Perfiles de reporte">
                              Perfiles
                            </button>
                            {u.usuarioAppId != null && !esYo && (
                              <button onClick={() => accion(
                                () => api.activarUsuario(u.codUsuarioICG, !u.activo),
                                `${u.login} ${u.activo ? 'desactivado' : 'activado'}`)}>
                                {u.activo ? 'Desactivar' : 'Activar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!lista.length && (
                    <tr><td colSpan={6} className="muted">Sin usuarios que mostrar.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted">
            Los usuarios sin contraseña en ICG no pueden iniciar sesión: el acceso a
            la reportería es solo por contraseña.
          </p>
        </>
      )}

      {tab === 'ROLES' && (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr><th>Rol</th><th>Crear</th><th>Editar</th><th>Ejecutar</th>
                    <th>Programar</th><th>Administrar</th></tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.AppRolId}>
                    <td><strong>{r.Nombre}</strong></td>
                    <td>{r.PuedeCrear ? '✓' : '—'}</td>
                    <td>{r.PuedeEditar ? '✓' : '—'}</td>
                    <td>{r.PuedeEjecutar ? '✓' : '—'}</td>
                    <td>{r.PuedeProgramar ? '✓' : '—'}</td>
                    <td>{r.PuedeAdministrar ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'HISTORIAL' && (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr><th>Fecha</th><th>Usuario</th><th>Acción</th>
                    <th>Rol anterior</th><th>Rol nuevo</th><th>Ejecutado por</th></tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.HistorialId}>
                    <td>{fecha(h.FechaCambio)}</td>
                    <td>{h.LoginICG || h.CodUsuarioICG}</td>
                    <td><code>{h.Accion}</code></td>
                    <td>{h.RolAnterior || '—'}</td>
                    <td>{h.RolNuevo || '—'}</td>
                    <td>{h.LoginEjecutor || '—'}</td>
                  </tr>
                ))}
                {!historial.length && (
                  <tr><td colSpan={6} className="muted">Sin cambios registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
