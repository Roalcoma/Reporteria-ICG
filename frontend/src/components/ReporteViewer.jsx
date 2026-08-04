import { useEffect, useState, lazy, Suspense } from 'react';
import { api } from '../api';
import Icono from './Icono';
import ParametrosForm from './ParametrosForm';
import DataGrid from './DataGrid';

// ECharts + pivottable solo se descargan al abrir un reporte de dashboard.
const DashboardPanel = lazy(() => import('./DashboardPanel'));

const FORMATOS = ['PDF', 'EXCEL', 'CSV', 'HTML', 'JSON', 'XML'];
const ORIENTACIONES = [{ id: 'VERTICAL', nombre: 'Vertical' }, { id: 'HORIZONTAL', nombre: 'Horizontal' }];
const HOJAS = [
  { id: 'A4', nombre: 'A4' }, { id: 'A3', nombre: 'A3' },
  { id: 'LETTER', nombre: 'Carta' }, { id: 'LEGAL', nombre: 'Oficio' },
  { id: 'TABLOID', nombre: 'Tabloide' }
];

/**
 * Visor de un reporte: selector de empresa (y ejercicio si es CONTABLE),
 * parametros dinamicos, ejecucion, grid de resultados, exportacion y
 * envio por correo ad-hoc sin salir de la pantalla.
 */
export default function ReporteViewer({ reporteId, empresaGestion }) {
  const [def, setDef] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [seleccion, setSeleccion] = useState({ codEmpresa: undefined, ejercicio: undefined });
  const [valores, setValores] = useState({});
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [mailAbierto, setMailAbierto] = useState(false);
  // Formato de impresión: parte del valor por defecto del reporte y se puede
  // ajustar para esta exportación concreta.
  const [pdfOrientacion, setPdfOrientacion] = useState('VERTICAL');
  const [pdfHoja, setPdfHoja] = useState('A4');

  useEffect(() => {
    setResultado(null); setError(null); setValores({});
    api.reporte(reporteId).then(async d => {
      setDef(d);
      setPdfOrientacion(d.reporte.OrientacionPdf || 'VERTICAL');
      setPdfHoja(d.reporte.TamanoHoja || 'A4');
      if (d.reporte.Area === 'CONTABLE') {
        // Solo los reportes contables piden elegir empresa contable + ejercicio.
        const emps = await api.empresas('CONTABLE');
        setEmpresas(emps);
        if (emps[0]) setSeleccion({ codEmpresa: emps[0].codEmpresa, ejercicio: emps[0].ejercicio });
      } else {
        // Gestión: se usa la empresa activa de la sesión (elegida al entrar).
        setEmpresas([]);
        setSeleccion({ codEmpresa: undefined, ejercicio: undefined });
      }
    }).catch(e => setError(e.message));
  }, [reporteId, empresaGestion?.codEmpresa]);

  const ejecutar = async () => {
    setCargando(true); setError(null);
    try {
      setResultado(await api.ejecutar(reporteId, { ...seleccion, parametros: valores }));
    } catch (e) { setError(e.message); setResultado(null); }
    finally { setCargando(false); }
  };

  const exportar = (formato) =>
    api.exportar(reporteId, { ...seleccion, parametros: valores, formato,
      // Solo aplican al PDF; el resto de formatos las ignora.
      orientacion: pdfOrientacion, tamanoHoja: pdfHoja })
      .catch(e => setError(e.message));

  if (error && !def) return <div className="error">{error}</div>;
  if (!def) return <div className="muted">Cargando…</div>;

  const esContable = def.reporte.Area === 'CONTABLE';
  const claveEmp = (e) => `${e.codEmpresa}|${e.ejercicio ?? ''}`;

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>{def.reporte.Nombre}</h2>
          {def.reporte.Descripcion && <p className="muted">{def.reporte.Descripcion}</p>}
        </div>
        <span className={`badge ${esContable ? 'contable' : 'gestion'}`}>{def.reporte.Area}</span>
      </header>

      <div className="filtros">
        {esContable ? (
          <label className="param">
            <span>Empresa contable / ejercicio</span>
            <select
              value={empresas.length ? claveEmp(seleccion) : ''}
              onChange={e => {
                const emp = empresas.find(x => claveEmp(x) === e.target.value);
                if (emp) setSeleccion({ codEmpresa: emp.codEmpresa, ejercicio: emp.ejercicio });
              }}>
              {empresas.length === 0 && <option value="">(sin empresas contables)</option>}
              {empresas.map(emp => (
                <option key={claveEmp(emp)} value={claveEmp(emp)}>
                  {emp.nombre}{emp.ejercicio ? ` — ${emp.ejercicio}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="param">
            <span>Empresa</span>
            <input value={empresaGestion?.nombre || empresaGestion?.codEmpresa || ''} disabled />
          </label>
        )}

        <ParametrosForm reporteId={reporteId} parametros={def.parametros}
          seleccion={seleccion} valores={valores} onChange={setValores} />

        <button className="primary" onClick={ejecutar} disabled={cargando}>
          {cargando ? 'Ejecutando…' : 'Ejecutar'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {resultado && (
        <>
          <div className="acciones">
            <button className="primary" onClick={() => exportar('PDF')}><Icono nombre="descargar" /> PDF</button>
            <select value={pdfOrientacion} onChange={e => setPdfOrientacion(e.target.value)}
                    title="Orientación del PDF">
              {ORIENTACIONES.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
            <select value={pdfHoja} onChange={e => setPdfHoja(e.target.value)}
                    title="Tamaño de hoja">
              {HOJAS.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
            </select>
            <span className="separador" />
            {FORMATOS.filter(f => f !== 'PDF').map(f => (
              <button key={f} onClick={() => exportar(f)}>{f}</button>
            ))}
            <button onClick={() => setMailAbierto(v => !v)}>Enviar por correo</button>
          </div>

          {mailAbierto && (
            <EnviarCorreo reporteId={reporteId} seleccion={seleccion} valores={valores}
              onCerrar={() => setMailAbierto(false)} onError={setError} />
          )}

          {def.reporte.Tipo === 'MASTER_DETAIL' ? (
            <>
              <h3>Cabecera</h3>
              <DataGrid rows={resultado.cabecera || []} columnas={resultado.columnas} consultaRol="CABECERA" />
              <h3>Detalle</h3>
              <DataGrid rows={resultado.detalle || []} columnas={resultado.columnas} consultaRol="DETALLE" />
            </>
          ) : def.reporte.Tipo === 'DASHBOARD' ? (
            <>
              <Suspense fallback={<p className="muted">Cargando panel…</p>}>
                <DashboardPanel rows={resultado.rows || []} columnas={resultado.columnas} />
              </Suspense>
              <details className="crudos">
                <summary>Ver datos crudos</summary>
                <DataGrid rows={resultado.rows || []} columnas={resultado.columnas} consultaRol="BASE" />
              </details>
            </>
          ) : (
            <DataGrid rows={resultado.rows || []} columnas={resultado.columnas} consultaRol="FLAT" />
          )}
        </>
      )}
    </div>
  );
}

function EnviarCorreo({ reporteId, seleccion, valores, onCerrar, onError }) {
  const [destinatarios, setDest] = useState('');
  const [asunto, setAsunto] = useState('');
  const [formato, setFormato] = useState('EXCEL');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    try {
      await api.enviar(reporteId, { ...seleccion, parametros: valores, destinatarios, asunto, formato });
      setOk(true); setTimeout(onCerrar, 1500);
    } catch (e) { onError(e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="mail-box">
      {ok ? <span className="ok">Correo enviado ✓</span> : (
        <>
          <input placeholder="destinatarios separados por ;" value={destinatarios}
            onChange={e => setDest(e.target.value)} style={{ minWidth: 280 }} />
          <input placeholder="asunto" value={asunto} onChange={e => setAsunto(e.target.value)} />
          <select value={formato} onChange={e => setFormato(e.target.value)}>
            {FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button className="primary" onClick={enviar} disabled={enviando || !destinatarios}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
          <button onClick={onCerrar}>Cancelar</button>
        </>
      )}
    </div>
  );
}
