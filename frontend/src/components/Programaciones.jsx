import { useEffect, useState } from 'react';
import { api } from '../api';

const FORMATOS = ['PDF', 'EXCEL', 'CSV', 'HTML', 'JSON', 'XML'];
const fecha = (v) => (v ? new Date(v).toLocaleString('es-VE') : '—');

/** Módulo Scheduler: programaciones de envío automático + historial de envíos. */
export default function Programaciones({ permisos }) {
  const [tab, setTab] = useState('PROG');
  const [progs, setProgs] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);

  const recargar = () => {
    api.programaciones().then(setProgs).catch(e => setError(e.message));
    api.historial().then(setHistorial).catch(() => {});
  };
  // Se envuelve para no devolver la promesa como funcion de limpieza.
  useEffect(() => { recargar(); }, []);

  const alternar = async (p) => {
    try { await api.activarProgramacion(p.ProgramacionId, !p.Activo); recargar(); }
    catch (e) { setError(e.message); }
  };
  const ejecutarAhora = async (p) => {
    try { await api.ejecutarAhora(p.ProgramacionId); setError(null); setTimeout(recargar, 1200); }
    catch (e) { setError(e.message); }
  };
  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar la programación "${p.Nombre}"?`)) return;
    try { await api.eliminarProgramacion(p.ProgramacionId); recargar(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="viewer">
      <header className="viewer-head">
        <h2>Envíos automáticos</h2>
      </header>

      <div className="grid-toolbar" style={{ marginTop: 10 }}>
        <button className={tab === 'PROG' ? 'primary' : ''} onClick={() => setTab('PROG')}>
          Programaciones ({progs.length})
        </button>
        <button className={tab === 'HIST' ? 'primary' : ''} onClick={() => setTab('HIST')}>
          Historial ({historial.length})
        </button>
        <div style={{ flex: 1 }} />
        {permisos?.PuedeProgramar && tab === 'PROG' && (
          <button className="primary" onClick={() => setCreando(v => !v)}>
            {creando ? 'Cancelar' : '+ Nueva'}
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {creando && (
        <NuevaProgramacion
          onCreada={() => { setCreando(false); recargar(); }}
          onError={setError} />
      )}

      {tab === 'PROG' ? (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>Nombre</th><th>Reporte</th><th>Cron</th><th>Formato</th>
                  <th>Destinatarios</th><th>Próxima</th><th>Última</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {progs.map(p => (
                  <tr key={p.ProgramacionId}>
                    <td>{p.Nombre}</td>
                    <td>{p.ReporteNombre}</td>
                    <td><code>{p.CronExpresion}</code></td>
                    <td>{p.FormatoExportacion}</td>
                    <td className="trunc" title={p.Destinatarios}>{p.Destinatarios}</td>
                    <td>{fecha(p.ProximaEjecucion)}</td>
                    <td>{fecha(p.UltimaEjecucion)}</td>
                    <td>
                      <span className={`badge ${p.Activo ? 'gestion' : ''}`}>
                        {p.Activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      {permisos?.PuedeProgramar && (
                        <div className="acciones-fila">
                          <button onClick={() => ejecutarAhora(p)}>Ejecutar ahora</button>
                          <button onClick={() => alternar(p)}>{p.Activo ? 'Pausar' : 'Activar'}</button>
                          <button onClick={() => eliminar(p)}>Eliminar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!progs.length && (
                  <tr><td colSpan={9} className="muted">Sin programaciones.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>Fecha</th><th>Reporte</th><th>Origen</th><th>Destinatarios</th>
                  <th>Formato</th><th className="num">Filas</th><th>Estado</th><th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.EnvioId}>
                    <td>{fecha(h.FechaEnvio)}</td>
                    <td>{h.ReporteNombre}</td>
                    <td>{h.Origen}</td>
                    <td className="trunc" title={h.Destinatarios}>{h.Destinatarios}</td>
                    <td>{h.FormatoAdjunto}</td>
                    <td className="num">{h.FilasResultado ?? ''}</td>
                    <td className={h.Estado === 'OK' ? 'ok' : 'estado-error'}>{h.Estado}</td>
                    <td className="trunc" title={h.MensajeError || ''}>{h.MensajeError || ''}</td>
                  </tr>
                ))}
                {!historial.length && (
                  <tr><td colSpan={8} className="muted">Sin envíos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Alta de programación con vista previa de las próximas corridas del cron. */
function NuevaProgramacion({ onCreada, onError }) {
  const [reportes, setReportes] = useState([]);
  const [form, setForm] = useState({
    ReporteId: '', Nombre: '', CronExpresion: '0 7 * * 1-5',
    FormatoExportacion: 'EXCEL', Destinatarios: '', Asunto: ''
  });
  const [preview, setPreview] = useState(null);

  useEffect(() => { api.reportes().then(setReportes).catch(() => {}); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validar = async () => {
    try { setPreview(await api.validarCron(form.CronExpresion)); }
    catch (e) { setPreview({ valida: false, error: e.message }); }
  };

  const crear = async () => {
    try {
      await api.crearProgramacion({ ...form, ReporteId: Number(form.ReporteId) });
      onCreada();
    } catch (e) { onError(e.message); }
  };

  return (
    <div className="filtros" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="param-form">
        <label className="param">
          <span>Reporte</span>
          <select value={form.ReporteId} onChange={e => set('ReporteId', e.target.value)}>
            <option value="">(seleccione)</option>
            {reportes.map(r => <option key={r.ReporteId} value={r.ReporteId}>{r.Nombre}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Nombre</span>
          <input value={form.Nombre} onChange={e => set('Nombre', e.target.value)} />
        </label>
        <label className="param">
          <span>Cron (min hora díaMes mes díaSem)</span>
          <input value={form.CronExpresion} onChange={e => set('CronExpresion', e.target.value)}
                 onBlur={validar} style={{ fontFamily: 'monospace' }} />
        </label>
        <label className="param">
          <span>Formato</span>
          <select value={form.FormatoExportacion} onChange={e => set('FormatoExportacion', e.target.value)}>
            {FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="param" style={{ flex: 1, minWidth: 260 }}>
          <span>Destinatarios (separados por ;)</span>
          <input value={form.Destinatarios} onChange={e => set('Destinatarios', e.target.value)} />
        </label>
        <label className="param">
          <span>Asunto</span>
          <input value={form.Asunto} onChange={e => set('Asunto', e.target.value)} />
        </label>
      </div>

      {preview && (preview.valida
        ? <p className="muted">Próximas: {preview.proximas.map(p => fecha(p)).join(' · ')}</p>
        : <div className="error">Cron inválido: {preview.error}</div>)}

      <div className="acciones">
        <button onClick={validar}>Ver próximas corridas</button>
        <button className="primary" onClick={crear}
                disabled={!form.ReporteId || !form.Nombre || !form.Destinatarios}>
          Crear programación
        </button>
      </div>
    </div>
  );
}
