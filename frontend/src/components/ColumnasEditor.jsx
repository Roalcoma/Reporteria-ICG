import { useState } from 'react';
import { api } from '../api';
import { formatValue } from '../format';

const FORMATOS = [
  { id: 'TEXTO', label: 'Texto' },
  { id: 'ENTERO', label: 'Entero' },
  { id: 'NUMERO', label: 'Número' },
  { id: 'MONEDA', label: 'Moneda' },
  { id: 'FECHA', label: 'Fecha' },
  { id: 'PORCENTAJE', label: 'Porcentaje' }
];
const AGREGACIONES = ['NINGUNA', 'SUMA', 'PROMEDIO', 'CONTEO', 'MIN', 'MAX'];

/**
 * Valor de ejemplo por formato. PORCENTAJE no multiplica por 100: en ICG los
 * porcentajes se guardan ya en escala 0-100 (un 12,34% se almacena como 12.34).
 */
const EJEMPLO = { TEXTO: 'Texto', ENTERO: 1234, NUMERO: 1234.56,
  MONEDA: 1234.56, FECHA: new Date(), PORCENTAJE: 12.34 };

/**
 * Configuración visual de las columnas de un reporte: título de presentación,
 * formato, visibilidad, agrupación y totales de pie.
 *
 * Las columnas se descubren ejecutando la consulta en modo diseño, así el
 * creador no tiene que escribir los nombres de campo a mano.
 */
export default function ColumnasEditor({ columnas, onChange, consultas, rolActivo,
  definiciones, area, reporteTipo }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [muestra, setMuestra] = useState(null);

  const detectar = async () => {
    setCargando(true); setError(null); setMuestra(null);
    try {
      const sqlText = consultas[rolActivo];
      if (!sqlText || !sqlText.trim()) throw new Error('Escriba primero la consulta.');

      // Se usan los valores por defecto de los parámetros para poder ejecutar.
      const valores = {};
      for (const d of definiciones) {
        if (d.ValorDefault != null && d.ValorDefault !== '') valores[d.Nombre] = d.ValorDefault;
      }
      const r = await api.descubrirColumnas({ sqlText, definiciones, parametros: valores, area });

      // Conserva la configuración ya hecha para las columnas que siguen existiendo.
      const previas = new Map(columnas.map(c => [c.NombreCampo, c]));
      onChange(r.columnas.map((c, i) => ({
        ...c, ConsultaRol: rolActivo, Orden: i,
        ...(previas.get(c.NombreCampo) || {}),
        NombreCampo: c.NombreCampo, TipoSql: c.TipoSql
      })));
      setMuestra(r.muestra);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const set = (i, campo, valor) =>
    onChange(columnas.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));

  const mover = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= columnas.length) return;
    const copia = [...columnas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(copia.map((c, k) => ({ ...c, Orden: k })));
  };

  return (
    <>
      <div className="grid-toolbar">
        <button className="primary" onClick={detectar} disabled={cargando}>
          {cargando ? 'Ejecutando…' : 'Detectar columnas'}
        </button>
        <span className="muted">
          Ejecuta la consulta {reporteTipo === 'MASTER_DETAIL' ? `(${rolActivo.toLowerCase()}) ` : ''}
          con los valores por defecto y lee las columnas del resultado.
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      {columnas.length === 0 ? (
        <p className="muted">
          Sin columnas configuradas. Si no las defines, el reporte mostrará todas
          las del resultado con su nombre original.
        </p>
      ) : (
        <div className="grid-wrap">
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>Orden</th><th>Campo</th><th>Título visible</th><th>Formato</th>
                  <th>Patrón</th><th>Visible</th><th>Ocultable</th>
                  <th>Agrupable</th><th>Total al pie</th><th>Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                {columnas.map((c, i) => (
                  <tr key={c.NombreCampo + i}>
                    <td>
                      <div className="acciones-fila">
                        <button onClick={() => mover(i, -1)} disabled={i === 0} title="Subir">↑</button>
                        <button onClick={() => mover(i, 1)}
                                disabled={i === columnas.length - 1} title="Bajar">↓</button>
                      </div>
                    </td>
                    <td>
                      <code>{c.NombreCampo}</code>
                      {c.TipoSql && <div className="muted" style={{ fontSize: 11 }}>{c.TipoSql}</div>}
                    </td>
                    <td>
                      <input value={c.AliasVisible ?? ''} style={{ width: 150 }}
                             onChange={e => set(i, 'AliasVisible', e.target.value)} />
                    </td>
                    <td>
                      <select value={c.Formato || 'TEXTO'}
                              onChange={e => set(i, 'Formato', e.target.value)}>
                        {FORMATOS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input value={c.FormatoPatron ?? ''} style={{ width: 90 }}
                             placeholder="#,##0.00"
                             onChange={e => set(i, 'FormatoPatron', e.target.value)} />
                    </td>
                    <td>
                      <input type="checkbox" checked={c.VisiblePorDefecto !== false}
                             onChange={e => set(i, 'VisiblePorDefecto', e.target.checked)} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!c.EsAdicional}
                             title="El usuario puede mostrarla u ocultarla desde el visor"
                             onChange={e => set(i, 'EsAdicional', e.target.checked)} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!c.EsAgrupable}
                             title="Permite agrupar el reporte por esta columna"
                             onChange={e => set(i, 'EsAgrupable', e.target.checked)} />
                    </td>
                    <td>
                      <select value={c.AgregacionPie || 'NINGUNA'}
                              onChange={e => set(i, 'AgregacionPie', e.target.value)}>
                        {AGREGACIONES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="muted">
                      {formatValue(EJEMPLO[c.Formato || 'TEXTO'], c.Formato || 'TEXTO', c.FormatoPatron)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {muestra && muestra.length > 0 && (
        <details className="crudos">
          <summary>Muestra de datos ({muestra.length} filas)</summary>
          <div className="grid-wrap">
            <div className="grid-scroll">
              <table className="grid">
                <thead>
                  <tr>{columnas.filter(c => c.VisiblePorDefecto !== false).map(c => (
                    <th key={c.NombreCampo}>{c.AliasVisible || c.NombreCampo}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {muestra.map((f, i) => (
                    <tr key={i}>
                      {columnas.filter(c => c.VisiblePorDefecto !== false).map(c => (
                        <td key={c.NombreCampo}
                            className={['ENTERO', 'NUMERO', 'MONEDA', 'PORCENTAJE'].includes(c.Formato)
                              ? 'num' : ''}>
                          {formatValue(f[c.NombreCampo], c.Formato || 'TEXTO', c.FormatoPatron)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </>
  );
}
