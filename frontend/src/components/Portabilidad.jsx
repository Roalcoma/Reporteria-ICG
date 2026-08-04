import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

/**
 * Portabilidad: exporta la definición de un reporte a un archivo .json y la
 * importa en otra instalación. El archivo lleva la consulta, los parámetros y
 * la configuración de columnas; no lleva datos ni credenciales.
 */
export default function Portabilidad({ onImportado }) {
  const [reportes, setReportes] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  // Estado de la importación
  const [bundle, setBundle] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [analisis, setAnalisis] = useState(null);
  const [carpetaId, setCarpetaId] = useState('');
  const [importando, setImportando] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.reportes().then(setReportes).catch(e => setError(e.message));
    api.carpetas().then(setCarpetas).catch(() => {});
  }, []);

  const exportar = async (r) => {
    setError(null); setOk(null);
    try {
      await api.exportarDefinicion(r.ReporteId);
      setOk(`Definición de "${r.Nombre}" descargada.`);
    } catch (e) { setError(e.message); }
  };

  const elegirArchivo = (file) => {
    setError(null); setOk(null); setAnalisis(null); setBundle(null);
    if (!file) return;
    setNombreArchivo(file.name);
    const lector = new FileReader();
    lector.onload = async () => {
      try {
        const json = JSON.parse(lector.result);
        setBundle(json);
        setAnalisis(await api.analizarDefinicion(json));
      } catch (e) {
        setError(e instanceof SyntaxError
          ? 'El archivo no es un JSON válido.' : e.message);
      }
    };
    lector.onerror = () => setError('No se pudo leer el archivo.');
    lector.readAsText(file);
  };

  const importar = async () => {
    setImportando(true); setError(null); setOk(null);
    try {
      const r = await api.importarDefinicion(bundle, carpetaId ? Number(carpetaId) : null);
      setOk(`Reporte importado (id ${r.ReporteId}).`);
      setBundle(null); setAnalisis(null); setNombreArchivo('');
      if (fileRef.current) fileRef.current.value = '';
      api.reportes().then(setReportes).catch(() => {});
      onImportado && onImportado(r.ReporteId);
    } catch (e) { setError(e.message); }
    finally { setImportando(false); }
  };

  const visibles = reportes.filter(r =>
    !filtro || r.Nombre.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>Portabilidad de reportes</h2>
          <p className="muted">
            Exporta la definición de un reporte (consulta, parámetros y columnas) a un
            archivo, para importarlo en la instalación de otro cliente. No se exportan
            datos ni credenciales.
          </p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      <h3>Importar definición</h3>
      <div className="filtros">
        <label className="param">
          <span>Archivo .json</span>
          <input ref={fileRef} type="file" accept="application/json,.json"
                 onChange={e => elegirArchivo(e.target.files?.[0])} />
        </label>
        <label className="param">
          <span>Carpeta destino</span>
          <select value={carpetaId} onChange={e => setCarpetaId(e.target.value)}>
            <option value="">(raíz)</option>
            {carpetas.map(c => <option key={c.CarpetaId} value={c.CarpetaId}>{c.Nombre}</option>)}
          </select>
        </label>
      </div>

      {analisis && (
        <div className={`import-preview ${analisis.valido ? '' : 'invalido'}`}>
          <div className="import-cab">
            <strong>{analisis.resumen.nombre || '(sin nombre)'}</strong>
            <span className="badge gestion">{analisis.resumen.tipo}</span>
            <span className={`badge ${analisis.resumen.area === 'CONTABLE' ? 'contable' : 'gestion'}`}>
              {analisis.resumen.area}
            </span>
            <span className="muted">{nombreArchivo}</span>
          </div>
          {analisis.resumen.descripcion && (
            <p className="muted" style={{ margin: '4px 0' }}>{analisis.resumen.descripcion}</p>
          )}
          <ul className="import-datos">
            <li><strong>Consultas:</strong> {analisis.resumen.consultas.join(', ') || '—'}</li>
            <li><strong>Parámetros:</strong> {analisis.resumen.parametros.join(', ') || 'ninguno'}</li>
            <li><strong>Columnas configuradas:</strong> {analisis.resumen.columnas}</li>
          </ul>

          {analisis.problemas.length > 0 && (
            <ul className="import-problemas">
              {analisis.problemas.map((p, i) => (
                <li key={i} className={p.nivel === 'ERROR' ? 'problema-error' : 'problema-aviso'}>
                  {p.nivel === 'ERROR' ? '✗' : '⚠'} {p.mensaje}
                </li>
              ))}
            </ul>
          )}

          <div className="acciones">
            <button className="primary" onClick={importar}
                    disabled={!analisis.valido || importando}>
              {importando ? 'Importando…' : 'Importar reporte'}
            </button>
            {!analisis.valido && (
              <span className="muted">
                Corrija los errores en el archivo de origen antes de importar.
              </span>
            )}
          </div>
        </div>
      )}

      <h3>Exportar definición</h3>
      <div className="filtros">
        <label className="param" style={{ minWidth: 260 }}>
          <span>Buscar reporte</span>
          <input value={filtro} onChange={e => setFiltro(e.target.value)}
                 placeholder="nombre del reporte" />
        </label>
      </div>

      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Reporte</th><th>Tipo</th><th>Área</th><th>Versión</th><th></th></tr>
            </thead>
            <tbody>
              {visibles.map(r => (
                <tr key={r.ReporteId}>
                  <td>{r.Nombre}</td>
                  <td>{r.Tipo}</td>
                  <td>
                    <span className={`badge ${r.Area === 'CONTABLE' ? 'contable' : 'gestion'}`}>
                      {r.Area}
                    </span>
                  </td>
                  <td className="num">{r.Version}</td>
                  <td>
                    <button onClick={() => exportar(r)}>Exportar .json</button>
                  </td>
                </tr>
              ))}
              {!visibles.length && (
                <tr><td colSpan={5} className="muted">Sin reportes que mostrar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
