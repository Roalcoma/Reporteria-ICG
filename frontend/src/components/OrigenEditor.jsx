import { useEffect, useState } from 'react';
import { api } from '../api';
import SqlEditor from './SqlEditor';
import { formatValue } from '../format';

const TIPOS = [
  { id: 'HECHOS', nombre: 'Hechos (se puede medir)', ayuda: 'Ventas, compras, existencias…' },
  { id: 'DIMENSION', nombre: 'Dimensión (describe)', ayuda: 'Artículos, clientes, almacenes…' }
];
const ROLES = ['DIMENSION', 'METRICA'];
const TIPO_DATO = ['STRING', 'INT', 'DECIMAL', 'DATE', 'DATETIME', 'BOOL'];
const AGREGACIONES = ['NINGUNA', 'SUMA', 'PROMEDIO', 'CONTEO', 'CONTEO_DISTINTO', 'MIN', 'MAX'];
const FORMATOS = ['TEXTO', 'ENTERO', 'NUMERO', 'MONEDA', 'FECHA', 'PORCENTAJE'];

const SQL_EJEMPLO = `SELECT c.CODPROVEEDOR, c.NOMPROVEEDOR
FROM dbo.PROVEEDORES c WITH(NOLOCK)`;

/**
 * Alta y edición de un origen de datos.
 *
 * El SQL lo escribe el SUPERVISOR y pasa por la misma guarda que los reportes.
 * "Probar" lo ejecuta acotado y propone los campos, para no tener que
 * declararlos a mano.
 */
export default function OrigenEditor({ origenId, onVolver, onGuardado }) {
  const [origen, setOrigen] = useState({
    Clave: '', Nombre: '', Descripcion: '', Tipo: 'HECHOS', Area: 'GESTION', SqlBase: SQL_EJEMPLO
  });
  const [campos, setCampos] = useState([]);
  const [esPropio, setEsPropio] = useState(true);
  const [muestra, setMuestra] = useState(null);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (origenId == null) return;
    api.origen(origenId).then(d => {
      setOrigen(d.origen);
      setEsPropio(d.esPropio);
      setCampos(d.campos.filter(c => !c.Obsoleto).map(c => ({
        clave: c.Clave, etiqueta: c.Etiqueta, descripcion: c.Descripcion,
        expresion: c.Expresion, rol: c.Rol, tipoDato: c.TipoDato,
        agregacion: c.Agregacion, formato: c.Formato, orden: c.Orden
      })));
    }).catch(e => setError(e.message));
  }, [origenId]);

  const set = (k, v) => setOrigen(o => ({ ...o, [k]: v }));
  const setCampo = (i, k, v) => setCampos(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const quitarCampo = (i) => setCampos(cs => cs.filter((_, j) => j !== i));

  const probar = async () => {
    setProbando(true); setError(null); setOk(null); setMuestra(null);
    try {
      const r = await api.probarOrigen(origen.SqlBase, origen.Area);
      setMuestra(r.muestra);
      // Se conserva lo ya configurado para las columnas que siguen existiendo.
      const previos = new Map(campos.map(c => [c.expresion.toUpperCase(), c]));
      setCampos(r.columnas.map((c, i) => {
        const previo = previos.get(c.nombre.toUpperCase());
        return previo ? { ...previo, orden: i } : {
          clave: c.nombre.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          etiqueta: c.nombre, expresion: c.nombre,
          rol: c.rol, tipoDato: c.tipoDato, agregacion: c.agregacion,
          formato: c.formato, orden: i
        };
      }));
      setOk(`SQL válido: ${r.columnas.length} columnas, ${r.muestra.length} filas de muestra.`);
    } catch (e) { setError(e.message); }
    finally { setProbando(false); }
  };

  const guardar = async () => {
    setGuardando(true); setError(null); setOk(null);
    try {
      const def = {
        clave: origen.Clave, nombre: origen.Nombre, descripcion: origen.Descripcion,
        tipo: origen.Tipo, area: origen.Area, sqlBase: origen.SqlBase, campos
      };
      if (origenId == null) {
        const r = await api.crearOrigen(def);
        onGuardado && onGuardado(r.OrigenId);
      } else {
        await api.actualizarOrigen(origenId, def);
        setOk('Origen actualizado. Los dashboards que lo usan verán el cambio.');
      }
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const soloLectura = origenId != null && !esPropio;

  return (
    <div className="viewer">
      <header className="viewer-head">
        <h2>{origenId == null ? 'Nuevo origen de datos' : `Origen «${origen.Clave}»`}</h2>
        <div style={{ flex: 1 }} />
        {!soloLectura && (
          <button className="primary" onClick={guardar}
                  disabled={guardando || !origen.Clave || !origen.SqlBase}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        <button onClick={onVolver}>Volver</button>
      </header>

      {soloLectura && (
        <div className="aviso">
          Este origen pertenece al catálogo <strong>{origen.Paquete}</strong> y es de solo
          lectura, para que nuestras actualizaciones puedan seguir corrigiéndolo.
          Duplícalo desde la lista si necesitas una versión propia.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      <div className="filtros">
        <label className="param">
          <span>Clave lógica</span>
          <input value={origen.Clave} disabled={origenId != null}
                 placeholder="COMPRASDETALLE" style={{ fontFamily: 'monospace' }}
                 onChange={e => set('Clave', e.target.value.toUpperCase())} />
        </label>
        <label className="param" style={{ minWidth: 200 }}>
          <span>Nombre visible</span>
          <input value={origen.Nombre} disabled={soloLectura}
                 placeholder="Compras (detalle)"
                 onChange={e => set('Nombre', e.target.value)} />
        </label>
        <label className="param" style={{ flex: 1, minWidth: 240 }}>
          <span>Descripción</span>
          <input value={origen.Descripcion || ''} disabled={soloLectura}
                 onChange={e => set('Descripcion', e.target.value)} />
        </label>
        <label className="param">
          <span>Tipo</span>
          <select value={origen.Tipo} disabled={soloLectura}
                  onChange={e => set('Tipo', e.target.value)}>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="param">
          <span>Área</span>
          <select value={origen.Area} disabled={soloLectura}
                  onChange={e => set('Area', e.target.value)}>
            <option value="GESTION">Gestión</option>
            <option value="CONTABLE">Contable</option>
          </select>
        </label>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        La clave no se puede cambiar después: es lo que guardan los dashboards.
      </p>

      <h3>Consulta SQL</h3>
      <p className="muted" style={{ margin: '0 0 6px' }}>
        Solo <code>SELECT</code>. Las columnas que devuelva serán los campos disponibles.
        Recuerda multiplicar los importes por <code>FACTORMONEDA</code> para llevarlos a la
        moneda principal.
      </p>
      <SqlEditor value={origen.SqlBase} soloLectura={soloLectura} altura={200}
                 onChange={v => set('SqlBase', v)} />

      <div className="acciones" style={{ marginTop: 8 }}>
        <button className="primary" onClick={probar} disabled={probando || !origen.SqlBase}>
          {probando ? 'Ejecutando…' : 'Probar y detectar campos'}
        </button>
        <span className="muted">Ejecuta la consulta acotada a 20 filas sobre la empresa activa.</span>
      </div>

      <h3>Campos ({campos.length})</h3>
      {campos.length === 0 ? (
        <p className="muted">Pulsa «Probar» para detectar las columnas de la consulta.</p>
      ) : (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr><th>Clave</th><th>Etiqueta</th><th>Columna SQL</th><th>Rol</th>
                    <th>Tipo</th><th>Agregación</th><th>Formato</th><th></th></tr>
              </thead>
              <tbody>
                {campos.map((c, i) => (
                  <tr key={i}>
                    <td><input value={c.clave} style={{ width: 130, fontFamily: 'monospace' }}
                               disabled={soloLectura}
                               onChange={e => setCampo(i, 'clave', e.target.value.toUpperCase())} /></td>
                    <td><input value={c.etiqueta} style={{ width: 140 }} disabled={soloLectura}
                               onChange={e => setCampo(i, 'etiqueta', e.target.value)} /></td>
                    <td><code>{c.expresion}</code></td>
                    <td>
                      <select value={c.rol} disabled={soloLectura}
                              onChange={e => setCampo(i, 'rol', e.target.value)}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={c.tipoDato} disabled={soloLectura}
                              onChange={e => setCampo(i, 'tipoDato', e.target.value)}>
                        {TIPO_DATO.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={c.agregacion} disabled={soloLectura || c.rol !== 'METRICA'}
                              onChange={e => setCampo(i, 'agregacion', e.target.value)}>
                        {AGREGACIONES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={c.formato} disabled={soloLectura}
                              onChange={e => setCampo(i, 'formato', e.target.value)}>
                        {FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td>{!soloLectura && (
                      <button onClick={() => quitarCampo(i)} title="Quitar campo">✕</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {campos.length > 0 && !soloLectura && (
        <p className="muted">
          Los campos que quites no se borran: quedan marcados como obsoletos, de modo que un
          dashboard que los use avise en lugar de romperse.
        </p>
      )}

      {muestra && muestra.length > 0 && (
        <details className="crudos" open>
          <summary>Muestra de datos ({muestra.length} filas)</summary>
          <div className="grid-wrap">
            <div className="grid-scroll" style={{ maxHeight: 260 }}>
              <table className="grid">
                <thead>
                  <tr>{campos.map(c => <th key={c.clave}>{c.etiqueta}</th>)}</tr>
                </thead>
                <tbody>
                  {muestra.map((f, i) => (
                    <tr key={i}>
                      {campos.map(c => (
                        <td key={c.clave}>{formatValue(f[c.expresion], c.formato)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
