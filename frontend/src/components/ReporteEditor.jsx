import { useEffect, useState } from 'react';
import { api } from '../api';
import SqlEditor, { extraerParametros } from './SqlEditor';
import ColumnasEditor from './ColumnasEditor';

const TIPOS = [
  { id: 'SIMPLE', label: 'Simple (plano)' },
  { id: 'MASTER_DETAIL', label: 'Multinivel (cabecera/detalle)' },
  { id: 'DASHBOARD', label: 'Origen para dashboard' }
];
const TIPO_DATO = ['STRING', 'INT', 'DECIMAL', 'DATE', 'DATETIME', 'BOOL'];
const CONTROLES = ['TEXTO', 'FECHA', 'BOOL', 'LISTA_ESTATICA', 'LISTA_SQL'];

/** Consultas requeridas segun el tipo de reporte. */
const rolesDe = (tipo) =>
  tipo === 'MASTER_DETAIL' ? ['CABECERA', 'DETALLE'] : tipo === 'DASHBOARD' ? ['BASE'] : ['FLAT'];

/**
 * Pantalla del Creador/Editor: define el reporte, escribe el T-SQL en el editor
 * Monaco (con realce de {PARAMETRO}) y tipifica los parametros detectados.
 *
 * CONSULTAS SEGÚN EL TIPO. Un reporte tiene una o dos consultas, cada una con un
 * «rol» (ver `rolesDe`). Los cuatro roles se mantienen en el estado a la vez
 * aunque solo se usen los del tipo activo: así, si el creador cambia de Simple a
 * Multinivel y vuelve, no pierde lo que ya había escrito.
 *
 * PARÁMETROS AUTODETECTADOS. No se declaran a mano: se extraen del SQL buscando
 * {NOMBRE} y se sincronizan en cada cambio. La sincronización CONSERVA la
 * tipificación de los parámetros que siguen existiendo —de lo contrario, editar
 * una línea del SQL reiniciaría a texto los tipos y las listas ya configuradas—
 * y descarta los que desaparecieron de la consulta.
 *
 * VALIDACIÓN. El SQL se valida en el servidor, no aquí. Este editor no replica
 * las reglas de sqlGuard a propósito: dos implementaciones de la misma regla se
 * separan con el tiempo, y la que importa es la del servidor. Aquí solo se
 * muestra el error que devuelve.
 */
export default function ReporteEditor({ reporteId, onGuardado, onCancelar }) {
  const [reporte, setReporte] = useState({
    Nombre: '', Descripcion: '', Tipo: 'SIMPLE', Area: 'GESTION', CarpetaId: null
  });
  const [sqls, setSqls] = useState({ FLAT: '', CABECERA: '', DETALLE: '', BASE: '' });
  const [vinculo, setVinculo] = useState({ cab: '', det: '' });
  const [parametros, setParametros] = useState([]);
  const [columnas, setColumnas] = useState([]);
  const [rolColumnas, setRolColumnas] = useState('FLAT');   // consulta activa en el editor de columnas
  const [carpetas, setCarpetas] = useState([]);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.carpetas().then(setCarpetas).catch(() => {}); }, []);

  useEffect(() => {
    if (!reporteId) return;
    api.reporte(reporteId).then(d => {
      setReporte(d.reporte);
      const s = { FLAT: '', CABECERA: '', DETALLE: '', BASE: '' };
      d.consultas.forEach(c => { s[c.Rol] = c.SqlText; });
      setSqls(s);
      const det = d.consultas.find(c => c.Rol === 'DETALLE');
      if (det) setVinculo({ cab: det.CampoVinculoCabecera || '', det: det.CampoVinculoDetalle || '' });
      setParametros(d.parametros);
      setColumnas(d.columnas || []);
    }).catch(e => setError(e.message));
  }, [reporteId]);

  const roles = rolesDe(reporte.Tipo);

  // Mantiene la consulta activa del editor de columnas dentro de las válidas.
  useEffect(() => {
    if (!roles.includes(rolColumnas)) setRolColumnas(roles[0]);
  }, [reporte.Tipo]);

  // Detecta los {PARAM} escritos en el SQL y los sincroniza con la lista.
  const sincronizarParametros = () => {
    const enSql = new Set(roles.flatMap(r => extraerParametros(sqls[r])));
    const existentes = new Map(parametros.map(p => [p.Nombre, p]));
    const siguiente = [...enSql].map((nombre, i) => existentes.get(nombre) || {
      Nombre: nombre, Etiqueta: nombre, TipoDato: 'STRING', Clase: 'VALOR',
      ControlUI: 'TEXTO', Obligatorio: false, PermiteMultiple: false, Orden: i, opciones: []
    });
    setParametros(siguiente);
  };
  useEffect(sincronizarParametros, [sqls.FLAT, sqls.CABECERA, sqls.DETALLE, sqls.BASE, reporte.Tipo]);

  const setParam = (i, campo, valor) =>
    setParametros(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      const consultas = roles.map((rol, i) => ({
        Rol: rol, SqlText: sqls[rol], Orden: i,
        ...(rol === 'DETALLE'
          ? { CampoVinculoCabecera: vinculo.cab, CampoVinculoDetalle: vinculo.det }
          : {})
      }));
      const def = { reporte, consultas, parametros, columnas };
      const r = reporteId
        ? await api.actualizarReporte(reporteId, def)
        : await api.crearReporte(def);
      onGuardado(reporteId || r.ReporteId);
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  return (
    <div className="viewer">
      <header className="viewer-head">
        <h2>{reporteId ? 'Editar reporte' : 'Nuevo reporte'}</h2>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="filtros">
        <label className="param" style={{ minWidth: 220 }}>
          <span>Nombre</span>
          <input value={reporte.Nombre}
                 onChange={e => setReporte(r => ({ ...r, Nombre: e.target.value }))} />
        </label>
        <label className="param" style={{ flex: 1, minWidth: 240 }}>
          <span>Descripción</span>
          <input value={reporte.Descripcion || ''}
                 onChange={e => setReporte(r => ({ ...r, Descripcion: e.target.value }))} />
        </label>
        <label className="param">
          <span>Tipo</span>
          <select value={reporte.Tipo} onChange={e => setReporte(r => ({ ...r, Tipo: e.target.value }))}>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Área</span>
          <select value={reporte.Area} onChange={e => setReporte(r => ({ ...r, Area: e.target.value }))}>
            <option value="GESTION">Gestión</option>
            <option value="CONTABLE">Contable</option>
          </select>
        </label>
        <label className="param">
          <span>PDF: orientación</span>
          <select value={reporte.OrientacionPdf || 'VERTICAL'}
                  onChange={e => setReporte(r => ({ ...r, OrientacionPdf: e.target.value }))}>
            <option value="VERTICAL">Vertical</option>
            <option value="HORIZONTAL">Horizontal</option>
          </select>
        </label>
        <label className="param">
          <span>PDF: hoja</span>
          <select value={reporte.TamanoHoja || 'A4'}
                  onChange={e => setReporte(r => ({ ...r, TamanoHoja: e.target.value }))}>
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="LETTER">Carta</option>
            <option value="LEGAL">Oficio</option>
            <option value="TABLOID">Tabloide</option>
          </select>
        </label>
        <label className="param">
          <span>Carpeta</span>
          <select value={reporte.CarpetaId ?? ''}
                  onChange={e => setReporte(r => ({ ...r, CarpetaId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">(raíz)</option>
            {carpetas.map(c => <option key={c.CarpetaId} value={c.CarpetaId}>{c.Nombre}</option>)}
          </select>
        </label>
      </div>

      {roles.map(rol => (
        <section key={rol} style={{ marginBottom: 14 }}>
          <h3>Consulta {rol.toLowerCase()}</h3>
          <p className="muted" style={{ margin: '0 0 6px' }}>
            Usa <code>{'{NOMBRE}'}</code> para declarar parámetros; se resaltan y se
            enlazan de forma segura al ejecutar. Solo se admite <code>SELECT</code>/
            <code>WITH</code>, o <code>{'EXEC esquema.sp @p = {PARAM}'}</code> si el
            procedimiento está autorizado.
          </p>
          <SqlEditor value={sqls[rol]} onChange={v => setSqls(s => ({ ...s, [rol]: v }))} />
        </section>
      ))}

      {reporte.Tipo === 'MASTER_DETAIL' && (
        <div className="filtros">
          <label className="param">
            <span>Campo vínculo en cabecera</span>
            <input value={vinculo.cab} onChange={e => setVinculo(v => ({ ...v, cab: e.target.value }))} />
          </label>
          <label className="param">
            <span>Campo vínculo en detalle</span>
            <input value={vinculo.det} onChange={e => setVinculo(v => ({ ...v, det: e.target.value }))} />
          </label>
        </div>
      )}

      <h3>Parámetros detectados ({parametros.length})</h3>
      {parametros.length === 0 ? (
        <p className="muted">Aún no hay <code>{'{PARAMETROS}'}</code> en el SQL.</p>
      ) : (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>Token</th><th>Etiqueta</th><th>Tipo</th><th>Control</th>
                  <th>Clase</th><th>Oblig.</th><th>Múltiple</th><th>Default</th>
                </tr>
              </thead>
              <tbody>
                {parametros.map((p, i) => (
                  <tr key={p.Nombre}>
                    <td><code>{`{${p.Nombre}}`}</code></td>
                    <td><input value={p.Etiqueta} onChange={e => setParam(i, 'Etiqueta', e.target.value)} /></td>
                    <td>
                      <select value={p.TipoDato} onChange={e => setParam(i, 'TipoDato', e.target.value)}>
                        {TIPO_DATO.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={p.ControlUI} onChange={e => setParam(i, 'ControlUI', e.target.value)}>
                        {CONTROLES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={p.Clase} onChange={e => setParam(i, 'Clase', e.target.value)}
                              title="IDENTIFICADOR se valida contra lista blanca (columnas dinámicas)">
                        <option value="VALOR">VALOR</option>
                        <option value="IDENTIFICADOR">IDENTIFICADOR</option>
                      </select>
                    </td>
                    <td><input type="checkbox" checked={!!p.Obligatorio}
                               onChange={e => setParam(i, 'Obligatorio', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={!!p.PermiteMultiple}
                               onChange={e => setParam(i, 'PermiteMultiple', e.target.checked)} /></td>
                    <td><input value={p.ValorDefault || ''} style={{ width: 110 }}
                               onChange={e => setParam(i, 'ValorDefault', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3>
        Columnas ({columnas.length})
        {roles.length > 1 && (
          <select value={rolColumnas} onChange={e => setRolColumnas(e.target.value)}
                  style={{ marginLeft: 10, fontWeight: 400 }}>
            {roles.map(r => <option key={r} value={r}>{r.toLowerCase()}</option>)}
          </select>
        )}
      </h3>
      <ColumnasEditor
        columnas={columnas.filter(c => (c.ConsultaRol || 'FLAT') === rolColumnas)}
        onChange={(nuevas) => setColumnas([
          // Se conservan las columnas de las otras consultas del reporte.
          ...columnas.filter(c => (c.ConsultaRol || 'FLAT') !== rolColumnas),
          ...nuevas.map(c => ({ ...c, ConsultaRol: rolColumnas }))
        ])}
        consultas={sqls}
        rolActivo={rolColumnas}
        definiciones={parametros}
        area={reporte.Area}
        reporteTipo={reporte.Tipo} />

      <div className="acciones" style={{ marginTop: 14 }}>
        <button className="primary" onClick={guardar} disabled={guardando || !reporte.Nombre}>
          {guardando ? 'Guardando…' : 'Guardar reporte'}
        </button>
        <button onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
