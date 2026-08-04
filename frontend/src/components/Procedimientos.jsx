import { useEffect, useState } from 'react';
import { api } from '../api';

const fecha = (v) => (v ? new Date(v).toLocaleString('es-VE') : '—');

/**
 * Administración de la lista blanca de procedimientos almacenados.
 * Un reporte solo puede ejecutar un SP si está registrado y activo aquí.
 *
 * «Descubrir» solo LEE el catálogo del sistema (sys.objects) de la base de la
 * empresa activa: enumera procedimientos, no los ejecuta.
 *
 * LÍMITE REAL DE ESTA LISTA, que conviene tener claro antes de autorizar nada:
 * un procedimiento hace internamente lo que quiera. La lista blanca impide que
 * se llame CUALQUIER cosa, pero la garantía de que no escriba proviene del login
 * SQL de solo lectura, no de esta pantalla.
 *
 * Autorice únicamente procedimientos de LECTURA revisados por un DBA, y preste
 * atención especial a los que usen EXECUTE AS: cambian la identidad efectiva
 * dentro del motor y podrían eludir precisamente ese login de solo lectura.
 *
 * Los del sistema (sp_, xp_) se rechazan siempre, aunque alguien consiga
 * registrarlos. Cada alta y cada baja quedan auditadas.
 */
export default function Procedimientos({ permisos }) {
  const [lista, setLista] = useState([]);
  const [descubiertos, setDescubiertos] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const recargar = () => api.procedimientos().then(setLista).catch(e => setError(e.message));
  // El callback de useEffect no debe devolver una promesa: React trataria el
  // valor devuelto como funcion de limpieza.
  useEffect(() => { recargar(); }, []);

  const puedeAdmin = !!permisos?.PuedeCrear;

  const descubrir = async () => {
    setError(null);
    try { setDescubiertos(await api.descubrirSp(filtro)); }
    catch (e) { setError(e.message); }
  };

  const autorizar = async (esquema, nombre, descripcion) => {
    setError(null); setOk(null);
    try {
      await api.autorizarSp({ esquema, nombre, descripcion });
      setOk(`Autorizado ${esquema}.${nombre}`);
      recargar();
    } catch (e) { setError(e.message); }
  };

  const alternar = async (p) => {
    try { await api.activarSp(p.ProcedimientoId, !p.Activo); recargar(); }
    catch (e) { setError(e.message); }
  };

  const revocar = async (p) => {
    if (!confirm(`¿Revocar la autorización de ${p.Esquema}.${p.Nombre}?`)) return;
    try { await api.revocarSp(p.ProcedimientoId); recargar(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>Procedimientos autorizados</h2>
          <p className="muted">
            Un reporte puede basarse en un procedimiento almacenado, pero solo en los
            registrados aquí. Use <code>{'EXEC esquema.nombre @p = {PARAMETRO}'}</code> en el editor.
          </p>
        </div>
      </header>

      <div className="aviso">
        Registre únicamente procedimientos de <strong>lectura</strong> revisados por un DBA.
        La lista blanca impide llamar cualquier SP, pero la garantía de que no escriba
        proviene del login SQL de solo lectura.
      </div>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      <h3>Autorizados ({lista.length})</h3>
      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Esquema</th><th>Nombre</th><th>Descripción</th><th>BD</th>
                  <th>Autorizó</th><th>Fecha</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.ProcedimientoId}>
                  <td>{p.Esquema}</td>
                  <td><code>{p.Nombre}</code></td>
                  <td className="trunc" title={p.Descripcion || ''}>{p.Descripcion || ''}</td>
                  <td>{p.BaseDatos || '(todas)'}</td>
                  <td>{p.LoginAutorizador || '—'}</td>
                  <td>{fecha(p.FechaAutorizacion)}</td>
                  <td><span className={`badge ${p.Activo ? 'gestion' : 'contable'}`}>
                    {p.Activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    {puedeAdmin && (
                      <div className="acciones-fila">
                        <button onClick={() => alternar(p)}>{p.Activo ? 'Desactivar' : 'Activar'}</button>
                        <button onClick={() => revocar(p)}>Revocar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!lista.length && (
                <tr><td colSpan={8} className="muted">
                  Ningún procedimiento autorizado todavía.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {puedeAdmin && (
        <>
          <h3>Buscar procedimientos en la empresa activa</h3>
          <div className="filtros">
            <label className="param">
              <span>Filtrar por nombre</span>
              <input value={filtro} onChange={e => setFiltro(e.target.value)}
                     placeholder="ej. REP_" />
            </label>
            <button className="primary" onClick={descubrir}>Buscar</button>
          </div>

          {descubiertos && (
            <div className="grid-wrap">
              <div className="grid-scroll">
                <table className="grid">
                  <thead>
                    <tr><th>Esquema</th><th>Nombre</th><th>Modificado</th><th></th></tr>
                  </thead>
                  <tbody>
                    {descubiertos.map((d, i) => {
                      const ya = lista.some(p =>
                        p.Esquema.toLowerCase() === d.Esquema.toLowerCase() &&
                        p.Nombre.toLowerCase() === d.Nombre.toLowerCase());
                      return (
                        <tr key={i}>
                          <td>{d.Esquema}</td>
                          <td><code>{d.Nombre}</code></td>
                          <td>{fecha(d.Modificado)}</td>
                          <td>
                            <button disabled={ya}
                                    onClick={() => autorizar(d.Esquema, d.Nombre, null)}>
                              {ya ? 'Ya autorizado' : 'Autorizar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!descubiertos.length && (
                      <tr><td colSpan={4} className="muted">Sin resultados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
