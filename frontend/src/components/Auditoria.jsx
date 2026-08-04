import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatValue } from '../format';

const fecha = (v) => (v ? new Date(v).toLocaleString('es-VE') : '—');
const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);

/** Panel de auditoría: estadísticas de uso + bitácora de eventos. */
export default function Auditoria() {
  const [tab, setTab] = useState('ESTADISTICAS');
  return (
    <div className="viewer">
      <header className="viewer-head"><h2>Auditoría y estadísticas</h2></header>
      <div className="grid-toolbar" style={{ marginTop: 10 }}>
        <button className={tab === 'ESTADISTICAS' ? 'primary' : ''} onClick={() => setTab('ESTADISTICAS')}>
          Estadísticas
        </button>
        <button className={tab === 'EVENTOS' ? 'primary' : ''} onClick={() => setTab('EVENTOS')}>
          Bitácora
        </button>
      </div>
      {tab === 'ESTADISTICAS' ? <Estadisticas /> : <Bitacora />}
    </div>
  );
}

function Estadisticas() {
  const [dias, setDias] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.estadisticas(dias).then(setD).catch(e => setError(e.message));
  }, [dias]);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">Cargando estadísticas…</p>;

  const t = d.totales || {};
  return (
    <>
      <div className="filtros">
        <label className="param">
          <span>Periodo</span>
          <select value={dias} onChange={e => setDias(Number(e.target.value))}>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={365}>Último año</option>
          </select>
        </label>
      </div>

      <div className="kpis">
        <Kpi titulo="Consultas" valor={t.Ejecuciones ?? 0} />
        <Kpi titulo="Usuarios activos" valor={t.UsuariosActivos ?? 0} />
        <Kpi titulo="Reportes usados" valor={t.ReportesUsados ?? 0} />
        <Kpi titulo="Errores" valor={t.Errores ?? 0} alerta={(t.Errores ?? 0) > 0} />
        <Kpi titulo="Duración media" valor={ms(t.DuracionMediaMs)} />
      </div>

      <Tabla titulo="Reportes más consultados" filas={d.masUsados}
        columnas={[
          ['Nombre', 'Reporte'], ['Ejecuciones', 'Consultas', true],
          ['UsuariosDistintos', 'Usuarios', true], ['DuracionMediaMs', 'Media', true, ms],
          ['Errores', 'Errores', true], ['UltimaEjecucion', 'Última', false, fecha]
        ]} />

      <Tabla titulo="Usuarios más activos" filas={d.usuarios}
        columnas={[
          ['LoginICG', 'Usuario'], ['Ejecuciones', 'Consultas', true],
          ['ReportesDistintos', 'Reportes', true], ['UltimaActividad', 'Última actividad', false, fecha]
        ]} />

      <Tabla titulo="Reportes más lentos" filas={d.masLentos}
        columnas={[
          ['Nombre', 'Reporte'], ['DuracionMediaMs', 'Media', true, ms],
          ['DuracionMaxMs', 'Máxima', true, ms], ['Ejecuciones', 'Consultas', true]
        ]} />

      <Tabla titulo="Actividad diaria" filas={d.actividadDiaria}
        columnas={[
          ['Dia', 'Día', false, v => new Date(v).toLocaleDateString('es-VE')],
          ['Ejecuciones', 'Consultas', true], ['UsuariosActivos', 'Usuarios', true],
          ['Errores', 'Errores', true], ['DuracionMediaMs', 'Media', true, ms]
        ]} />

      <Tabla titulo="Eventos por tipo" filas={d.eventosPorTipo}
        columnas={[['Tipo', 'Evento'], ['Total', 'Total', true]]} />

      {d.sinUso?.length > 0 && (
        <Tabla titulo={`Reportes nunca consultados (${d.sinUso.length})`} filas={d.sinUso}
          columnas={[['Nombre', 'Reporte'], ['Tipo', 'Tipo'], ['Area', 'Área']]} />
      )}
    </>
  );
}

const Kpi = ({ titulo, valor, alerta }) => (
  <div className={`kpi ${alerta ? 'kpi-alerta' : ''}`}>
    <span className="kpi-valor">{typeof valor === 'number' ? formatValue(valor, 'ENTERO') : valor}</span>
    <span className="kpi-titulo">{titulo}</span>
  </div>
);

function Tabla({ titulo, filas, columnas }) {
  if (!filas?.length) return null;
  return (
    <>
      <h3>{titulo}</h3>
      <div className="grid-wrap" style={{ marginBottom: 14 }}>
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr>{columnas.map(([k, label, num]) =>
                <th key={k} className={num ? 'num' : ''}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  {columnas.map(([k, , num, fmt]) => (
                    <td key={k} className={num ? 'num' : ''}>
                      {fmt ? fmt(f[k]) : (num && typeof f[k] === 'number'
                        ? formatValue(f[k], 'ENTERO') : (f[k] ?? ''))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Bitacora() {
  const [eventos, setEventos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [filtro, setFiltro] = useState({ tipo: '', desde: '', hasta: '', top: 200 });
  const [error, setError] = useState(null);

  const cargar = () => api.auditoriaEventos(filtro).then(setEventos).catch(e => setError(e.message));
  useEffect(() => { api.auditoriaTipos().then(setTipos).catch(() => {}); }, []);
  useEffect(() => { cargar(); }, [filtro.tipo, filtro.desde, filtro.hasta]);

  return (
    <>
      <div className="filtros">
        <label className="param">
          <span>Tipo de evento</span>
          <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">(todos)</option>
            {tipos.map(t => <option key={t.Tipo} value={t.Tipo}>{t.Tipo} ({t.Total})</option>)}
          </select>
        </label>
        <label className="param">
          <span>Desde</span>
          <input type="date" value={filtro.desde}
                 onChange={e => setFiltro(f => ({ ...f, desde: e.target.value }))} />
        </label>
        <label className="param">
          <span>Hasta</span>
          <input type="date" value={filtro.hasta}
                 onChange={e => setFiltro(f => ({ ...f, hasta: e.target.value }))} />
        </label>
        <button onClick={cargar}>Actualizar</button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th>Fecha</th><th>Evento</th><th>Usuario</th><th>Entidad</th>
                <th>Descripción</th><th>Empresa</th><th>OK</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map(e => (
                <tr key={e.EventoId}>
                  <td>{fecha(e.FechaEvento)}</td>
                  <td><code>{e.Tipo}</code></td>
                  <td>{e.LoginICG || '—'}</td>
                  <td>{e.Entidad ? `${e.Entidad} ${e.EntidadId ?? ''}` : '—'}</td>
                  <td className="trunc" title={e.Descripcion || ''}>{e.Descripcion || ''}</td>
                  <td>{e.EmpresaCod ?? ''}{e.Ejercicio ? `/${e.Ejercicio}` : ''}</td>
                  <td className={e.Exitoso ? 'ok' : 'estado-error'}>{e.Exitoso ? '✓' : '✗'}</td>
                </tr>
              ))}
              {!eventos.length && <tr><td colSpan={7} className="muted">Sin eventos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
