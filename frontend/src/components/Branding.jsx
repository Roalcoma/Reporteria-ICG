import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const MAX_BYTES = 1024 * 1024; // debe coincidir con el backend
const fecha = (v) => (v ? new Date(v).toLocaleString('es-VE') : '—');
const claveEmp = (e) => `${e.tipo || e.Tipo}|${e.codEmpresa ?? e.CodigoICG}|${e.ejercicio ?? e.Ejercicio ?? ''}`;

/**
 * Identidad corporativa por empresa: logo, encabezado y pie institucional.
 * Se incrustan al exportar/enviar en HTML.
 */
export default function Branding({ permisos }) {
  const [empresas, setEmpresas] = useState([]);
  const [configuradas, setConfiguradas] = useState([]);
  const [sel, setSel] = useState(null);          // empresa elegida
  const [datos, setDatos] = useState({ logoDataUri: null, encabezadoHtml: '', pieHtml: '' });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);

  const puedeEditar = !!(permisos?.PuedeCrear || permisos?.PuedeEditar);

  // Carga las empresas a las que el usuario tiene acceso (gestión + contables).
  useEffect(() => {
    (async () => {
      try {
        const [g, c] = await Promise.all([
          api.empresas('GESTION').catch(() => []),
          api.empresas('CONTABLE').catch(() => [])
        ]);
        const todas = [...g, ...c];
        setEmpresas(todas);
        if (todas[0]) setSel(todas[0]);
      } catch (e) { setError(e.message); }
      recargarConfiguradas();
    })();
  }, []);

  const recargarConfiguradas = () =>
    api.brandingLista().then(setConfiguradas).catch(() => {});

  // Al cambiar de empresa, trae su branding actual.
  useEffect(() => {
    if (!sel) return;
    setOk(null); setError(null);
    api.brandingDe(sel.tipo, sel.codEmpresa, sel.ejercicio)
      .then(b => setDatos({
        logoDataUri: b.logoDataUri || null,
        encabezadoHtml: b.encabezadoHtml || '',
        pieHtml: b.pieHtml || ''
      }))
      .catch(e => setError(e.message));
  }, [sel && claveEmp(sel)]);

  const elegirArchivo = (file) => {
    setError(null); setOk(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(`El logo pesa ${(file.size / 1024 / 1024).toFixed(2)} MB; el máximo es 1 MB.`);
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setDatos(d => ({ ...d, logoDataUri: lector.result }));
    lector.onerror = () => setError('No se pudo leer el archivo.');
    lector.readAsDataURL(file);
  };

  const guardar = async () => {
    if (!sel) return;
    setGuardando(true); setError(null); setOk(null);
    try {
      await api.guardarBranding({
        tipo: sel.tipo, codigoICG: sel.codEmpresa, ejercicio: sel.ejercicio,
        // Si el logo ya venía de la BD (no cambió), no se reenvía.
        logoDataUri: datos.logoDataUri?.startsWith('data:') ? datos.logoDataUri : null,
        encabezadoHtml: datos.encabezadoHtml,
        pieHtml: datos.pieHtml
      });
      setOk('Branding guardado.');
      recargarConfiguradas();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const quitarLogo = async () => {
    if (!sel || !confirm('¿Eliminar el logo de esta empresa?')) return;
    try {
      await api.eliminarLogo(sel.tipo, sel.codEmpresa, sel.ejercicio);
      setDatos(d => ({ ...d, logoDataUri: null }));
      if (fileRef.current) fileRef.current.value = '';
      setOk('Logo eliminado.');
      recargarConfiguradas();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div>
          <h2>Identidad corporativa</h2>
          <p className="muted">
            El logo y el encabezado se incrustan al exportar o enviar en formato HTML.
          </p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      <div className="filtros">
        <label className="param" style={{ minWidth: 320 }}>
          <span>Empresa</span>
          <select value={sel ? claveEmp(sel) : ''}
                  onChange={e => setSel(empresas.find(x => claveEmp(x) === e.target.value))}>
            {empresas.map(e => (
              <option key={claveEmp(e)} value={claveEmp(e)}>
                [{e.tipo === 'CONTABLE' ? 'Contable' : 'Gestión'}] {e.codEmpresa} — {e.nombre || '(sin nombre)'}
                {e.ejercicio ? ` · ${e.ejercicio}` : ''}
              </option>
            ))}
            {!empresas.length && <option value="">(sin empresas disponibles)</option>}
          </select>
        </label>
      </div>

      {sel && (
        <div className="branding-grid">
          <section className="branding-col">
            <h3>Logo</h3>
            <div className="logo-box">
              {datos.logoDataUri
                ? <img src={datos.logoDataUri} alt="Logo" />
                : <span className="muted">Sin logo</span>}
            </div>
            {puedeEditar && (
              <div className="acciones">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                       onChange={e => elegirArchivo(e.target.files?.[0])} />
                {datos.logoDataUri && <button onClick={quitarLogo}>Quitar logo</button>}
              </div>
            )}
            <p className="muted">PNG, JPG, GIF, WEBP o SVG. Máximo 1 MB.</p>
          </section>

          <section className="branding-col">
            <h3>Encabezado</h3>
            <textarea rows={5} disabled={!puedeEditar} value={datos.encabezadoHtml}
                      onChange={e => setDatos(d => ({ ...d, encabezadoHtml: e.target.value }))}
                      placeholder="Ej.: <strong>INVERSIONES LOS ARENAS, C.A.</strong><br>RIF J-12345678-9" />
            <h3>Pie de página</h3>
            <textarea rows={3} disabled={!puedeEditar} value={datos.pieHtml}
                      onChange={e => setDatos(d => ({ ...d, pieHtml: e.target.value }))}
                      placeholder="Ej.: Documento generado automáticamente" />
            {puedeEditar && (
              <div className="acciones">
                <button className="primary" onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar branding'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {sel && (
        <>
          <h3>Vista previa del encabezado</h3>
          <div className="branding-preview">
            <header>
              {datos.logoDataUri && <img src={datos.logoDataUri} alt="" />}
              <div dangerouslySetInnerHTML={{ __html: datos.encabezadoHtml || '' }} />
            </header>
            <h4>Nombre del reporte</h4>
            <table>
              <thead><tr><th>Columna A</th><th>Columna B</th></tr></thead>
              <tbody><tr><td>Dato</td><td>Dato</td></tr></tbody>
            </table>
            {datos.pieHtml && (
              <footer dangerouslySetInnerHTML={{ __html: datos.pieHtml }} />
            )}
          </div>
        </>
      )}

      <h3>Empresas configuradas ({configuradas.length})</h3>
      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th>Tipo</th><th>Código</th><th>Empresa</th><th>Ejercicio</th>
                  <th>Logo</th><th>Encabezado</th><th>Actualizado</th></tr>
            </thead>
            <tbody>
              {configuradas.map(c => (
                <tr key={c.EmpresaId}>
                  <td><span className={`badge ${c.Tipo === 'CONTABLE' ? 'contable' : 'gestion'}`}>
                    {c.Tipo}</span></td>
                  <td className="num">{c.CodigoICG}</td>
                  <td>{c.Nombre || '—'}</td>
                  <td className="num">{c.Ejercicio ?? ''}</td>
                  <td>{c.TieneLogo ? '✓' : '—'}</td>
                  <td>{c.TieneEncabezado ? '✓' : '—'}</td>
                  <td>{fecha(c.FechaActualizacion)}</td>
                </tr>
              ))}
              {!configuradas.length && (
                <tr><td colSpan={7} className="muted">Ninguna empresa configurada todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
