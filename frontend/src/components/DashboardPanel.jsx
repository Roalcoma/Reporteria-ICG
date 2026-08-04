import { useMemo, useState } from 'react';
import PivotTableUI from 'react-pivottable/PivotTableUI';
import TableRenderers from 'react-pivottable/TableRenderers';
import 'react-pivottable/pivottable.css';
import ReactECharts from 'echarts-for-react';
import { formatValue } from '../format';

/**
 * Vistas dinámicas sobre el dataset crudo de un reporte tipo DASHBOARD:
 *  - Tabla dinámica con arrastrar y soltar (react-pivottable)
 *  - Gráfico configurable sin código (ECharts): dimensión + medida + agregación
 */
const AGREGACIONES = [
  { id: 'SUMA', label: 'Suma' },
  { id: 'PROMEDIO', label: 'Promedio' },
  { id: 'CONTEO', label: 'Conteo' },
  { id: 'MAX', label: 'Máximo' },
  { id: 'MIN', label: 'Mínimo' }
];
const TIPOS = [
  { id: 'bar', label: 'Barras' },
  { id: 'line', label: 'Líneas' },
  { id: 'pie', label: 'Torta' }
];

/** Agrupa filas por una dimensión y aplica la agregación sobre la medida. */
function agrupar(rows, dimension, medida, agregacion) {
  const mapa = new Map();
  for (const r of rows) {
    const clave = r[dimension] ?? '(vacío)';
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(Number(r[medida]));
  }
  const salida = [];
  for (const [clave, valores] of mapa) {
    const nums = valores.filter(n => !isNaN(n));
    let v;
    switch (agregacion) {
      case 'PROMEDIO': v = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; break;
      case 'CONTEO':   v = valores.length; break;
      case 'MAX':      v = nums.length ? Math.max(...nums) : 0; break;
      case 'MIN':      v = nums.length ? Math.min(...nums) : 0; break;
      default:         v = nums.reduce((a, b) => a + b, 0);
    }
    salida.push({ clave: String(clave), valor: Number(v.toFixed(4)) });
  }
  return salida.sort((a, b) => b.valor - a.valor);
}

export default function DashboardPanel({ rows, columnas }) {
  const [vista, setVista] = useState('GRAFICO');
  const [pivotState, setPivotState] = useState({});

  const campos = useMemo(() => Object.keys(rows[0] || {}), [rows]);
  // Heurística: campos con valores numéricos son candidatos a medida.
  const numericos = useMemo(
    () => campos.filter(c => rows.some(r => r[c] !== null && r[c] !== '' && !isNaN(Number(r[c])))),
    [campos, rows]);
  const dimensiones = useMemo(
    () => campos.filter(c => !numericos.includes(c)).concat(campos.filter(c => numericos.includes(c))),
    [campos, numericos]);

  const [dimension, setDimension] = useState(() => dimensiones[0] || '');
  const [medida, setMedida] = useState(() => numericos[0] || '');
  const [agregacion, setAgregacion] = useState('SUMA');
  const [tipo, setTipo] = useState('bar');

  const datos = useMemo(
    () => (dimension && medida ? agrupar(rows, dimension, medida, agregacion).slice(0, 40) : []),
    [rows, dimension, medida, agregacion]);

  const formatoMedida = useMemo(() => {
    const def = (columnas || []).find(c => c.NombreCampo === medida);
    return def?.Formato || 'NUMERO';
  }, [columnas, medida]);

  const option = useMemo(() => {
    if (tipo === 'pie') {
      return {
        tooltip: { trigger: 'item' },
        legend: { type: 'scroll', bottom: 0 },
        series: [{
          type: 'pie', radius: ['35%', '65%'],
          data: datos.map(d => ({ name: d.clave, value: d.valor }))
        }]
      };
    }
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 20, bottom: 80 },
      xAxis: { type: 'category', data: datos.map(d => d.clave), axisLabel: { rotate: 40, fontSize: 11 } },
      yAxis: { type: 'value' },
      series: [{ type: tipo, data: datos.map(d => d.valor), smooth: tipo === 'line' }]
    };
  }, [datos, tipo]);

  if (!rows.length) return <p className="muted">Sin datos para analizar.</p>;

  return (
    <div className="dash">
      <div className="grid-toolbar">
        <button className={vista === 'GRAFICO' ? 'primary' : ''} onClick={() => setVista('GRAFICO')}>
          Gráfico
        </button>
        <button className={vista === 'PIVOT' ? 'primary' : ''} onClick={() => setVista('PIVOT')}>
          Tabla dinámica
        </button>
        <span className="muted">{rows.length} filas</span>
      </div>

      {vista === 'GRAFICO' ? (
        <>
          <div className="dash-config">
            <label className="param">
              <span>Agrupar por</span>
              <select value={dimension} onChange={e => setDimension(e.target.value)}>
                {dimensiones.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="param">
              <span>Medida</span>
              <select value={medida} onChange={e => setMedida(e.target.value)}>
                {numericos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="param">
              <span>Agregación</span>
              <select value={agregacion} onChange={e => setAgregacion(e.target.value)}>
                {AGREGACIONES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="param">
              <span>Tipo</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          {datos.length
            ? <ReactECharts option={option} style={{ height: 380 }} notMerge />
            : <p className="muted">Elige una dimensión y una medida numérica.</p>}
          {datos.length > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              Total: {formatValue(datos.reduce((a, d) => a + d.valor, 0), formatoMedida)}
              {datos.length === 40 && ' · mostrando el top 40'}
            </p>
          )}
        </>
      ) : (
        <div className="pivot-scroll">
          <PivotTableUI
            data={rows}
            onChange={setPivotState}
            renderers={TableRenderers}
            {...pivotState}
          />
        </div>
      )}
    </div>
  );
}
