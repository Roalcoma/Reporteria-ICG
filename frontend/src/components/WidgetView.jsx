import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { api } from '../api';
import { formatValue, esNumerico } from '../format';
import Icono from './Icono';

/** Tipos de widget disponibles en el constructor. */
export const TIPOS_WIDGET = [
  { id: 'bar',    nombre: 'Barras',    icono: 'barras' },
  { id: 'line',   nombre: 'Líneas',    icono: 'lineas' },
  { id: 'pie',    nombre: 'Torta',     icono: 'torta' },
  { id: 'tabla',  nombre: 'Tabla',     icono: 'tabla' },
  { id: 'kpi',    nombre: 'Indicador', icono: 'indicador' }
];

/**
 * Paleta categórica de la serie. Los tonos se distinguen también en escala de
 * grises y por luminosidad, para que un daltónico pueda separarlos: el color
 * nunca debe ser el único portador de significado.
 */
const COLORES = ['#1E40AF', '#D97706', '#0F766E', '#BE185D', '#4338CA',
                 '#65A30D', '#0369A1', '#9333EA', '#B45309'];

/**
 * Descarta los filtros a medio configurar.
 *
 * Mientras el usuario añade un filtro, la fila existe pero aún no tiene campo
 * ni valor; enviarla provocaría un error de validación en el servidor y una
 * alarma inútil en pantalla. Se ignoran hasta que estén completos.
 */
export function filtrosCompletos(filtros) {
  return (filtros || []).filter(f => {
    if (!f.campo) return false;
    if (f.operador === 'ENTRE') return f.desde !== '' && f.desde != null
                                    && f.hasta !== '' && f.hasta != null;
    return f.valor !== '' && f.valor != null;
  });
}

/** Consulta lista para enviar: sin filtros incompletos. */
export function consultaLimpia(consulta) {
  if (!consulta) return consulta;
  return { ...consulta, filtros: filtrosCompletos(consulta.filtros) };
}

/**
 * Ejecuta la consulta de un widget y lo dibuja.
 * Se le pasa `recarga` para que el contenedor pueda forzar una nueva consulta
 * (por ejemplo al cambiar de empresa o al aplicar un filtro global).
 */
export default function WidgetView({ widget, recarga = 0, alto = 300,
  filtrosExtra = [], onSeleccionar = null, seleccionActiva = null }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  // A la consulta propia del widget se le suman los filtros del panel (slicers)
  // y la selección hecha en otro gráfico, de modo que todo el tablero responde
  // a la vez.
  const consulta = useMemo(() => {
    const base = consultaLimpia(widget?.consulta);
    if (!base || !filtrosExtra.length) return base;
    return { ...base, filtros: [...(base.filtros || []), ...filtrosExtra] };
  }, [widget?.consulta, JSON.stringify(filtrosExtra)]);
  const firma = JSON.stringify(consulta);

  useEffect(() => {
    if (!consulta || (!consulta.metricas?.length && !consulta.dimensiones?.length)) {
      setDatos(null); return;
    }
    let vigente = true;
    setCargando(true); setError(null);
    api.consultarSemantico(consulta)
      .then(r => { if (vigente) setDatos(r); })
      .catch(e => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setCargando(false); });
    // Se ignora el resultado si el widget cambió mientras llegaba la respuesta.
    return () => { vigente = false; };
  }, [firma, recarga]);

  const columnas = datos?.columnas || [];
  const dims = columnas.filter(c => c.Rol === 'DIMENSION');
  const mets = columnas.filter(c => c.Rol === 'METRICA');
  const filas = datos?.rows || [];

  const option = useMemo(() => {
    if (!filas.length || !mets.length) return null;
    const etiquetas = filas.map(f =>
      dims.map(d => formatValue(f[d.NombreCampo], d.Formato)).join(' · ') || '(sin dato)');

    if (widget.tipo === 'pie') {
      return {
        tooltip: { trigger: 'item' },
        legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
        color: COLORES,
        series: [{
          type: 'pie', radius: ['38%', '66%'],
          data: filas.map((f, i) => ({ name: etiquetas[i], value: Number(f[mets[0].NombreCampo]) || 0 }))
        }]
      };
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: mets.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
      color: COLORES,
      grid: { left: 70, right: 24, top: mets.length > 1 ? 34 : 16, bottom: 74 },
      xAxis: { type: 'category', data: etiquetas,
               axisLabel: { rotate: 38, fontSize: 10, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: mets.map(m => ({
        name: m.AliasVisible, type: widget.tipo === 'line' ? 'line' : 'bar',
        smooth: widget.tipo === 'line',
        data: filas.map(f => Number(f[m.NombreCampo]) || 0)
      }))
    };
  }, [filas, firma]);

  if (error) return <div className="widget-error"><Icono nombre="aviso" /> {error}</div>;
  if (cargando && !datos) return <p className="muted">Consultando…</p>;
  if (!consulta?.metricas?.length && !consulta?.dimensiones?.length) {
    return <p className="muted">Configura los campos del widget.</p>;
  }
  if (!filas.length) return <p className="muted">Sin datos para esta consulta.</p>;

  // Indicador: una sola cifra grande con el total de cada métrica.
  if (widget.tipo === 'kpi') {
    return (
      <div className="kpis">
        {mets.map(m => {
          const total = filas.reduce((a, f) => a + (Number(f[m.NombreCampo]) || 0), 0);
          return (
            <div className="kpi" key={m.NombreCampo}>
              <span className="kpi-valor">{formatValue(total, m.Formato)}</span>
              <span className="kpi-titulo">{m.AliasVisible}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (widget.tipo === 'tabla') {
    // Al igual que en los gráficos, pulsar una fila filtra el resto del panel.
    const seleccionable = onSeleccionar && dims.length > 0;
    const filaSeleccionada = (f) => seleccionActiva && dims[0] &&
      seleccionActiva.campo === dims[0].clave &&
      seleccionActiva.valor === f[dims[0].NombreCampo];

    const pulsar = (f) => {
      if (!seleccionable) return;
      const dim = dims[0];
      const valor = f[dim.NombreCampo];
      onSeleccionar(filaSeleccionada(f)
        ? null
        : { campo: dim.clave, valor, etiqueta: dim.AliasVisible });
    };

    return (
      <div className="grid-wrap">
        <div className="grid-scroll" style={{ maxHeight: alto }}>
          <table className={`grid ${seleccionable ? 'seleccionable' : ''}`}>
            <thead>
              <tr>{columnas.map(c =>
                <th key={c.NombreCampo} className={esNumerico(c.Formato) ? 'num' : ''}>
                  {c.AliasVisible}
                </th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} onClick={() => pulsar(f)}
                    className={filaSeleccionada(f) ? 'fila-seleccionada' : ''}
                    title={seleccionable ? 'Pulsa para filtrar el panel por esta fila' : ''}>
                  {columnas.map(c => (
                    <td key={c.NombreCampo} className={esNumerico(c.Formato) ? 'num' : ''}>
                      {formatValue(f[c.NombreCampo], c.Formato)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!option) return <p className="muted">Añade al menos una métrica para dibujar el gráfico.</p>;

  /**
   * Al pulsar una barra o porción, se avisa al panel para que filtre el resto
   * de objetos por ese valor. Volver a pulsarla quita el filtro.
   */
  const alPulsar = onSeleccionar && dims.length
    ? {
        click: (p) => {
          const fila = filas[p.dataIndex];
          if (!fila) return;
          const dim = dims[0];
          const valor = fila[dim.NombreCampo];
          const yaActiva = seleccionActiva &&
            seleccionActiva.campo === dim.clave && seleccionActiva.valor === valor;
          onSeleccionar(yaActiva ? null : { campo: dim.clave, valor, etiqueta: dim.AliasVisible });
        }
      }
    : undefined;

  return (
    <ReactECharts option={option} style={{ height: alto, cursor: onSeleccionar ? 'pointer' : 'default' }}
                  notMerge lazyUpdate onEvents={alPulsar} />
  );
}
