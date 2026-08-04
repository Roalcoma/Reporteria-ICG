import { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getGroupedRowModel, getExpandedRowModel, flexRender
} from '@tanstack/react-table';
import { formatValue, esNumerico, calcularAgregacion } from '../format';

/**
 * Grid de resultados con TanStack Table (MIT):
 *  - visibilidad de columnas (ocultar/mostrar sin tocar el SQL)
 *  - alias de presentacion y formatos (moneda/fecha/porcentaje)
 *  - agrupacion por un campo de nivel con subtotales
 *  - metricas de pie (suma/promedio/conteo/min/max)
 *
 * COLUMNAS INFERIDAS. Si el reporte no trae definición de columnas —recién
 * creado, o importado sin configurarlas— se deducen de la primera fila del
 * resultado. Así una consulta nueva se ve de inmediato en lugar de mostrar una
 * rejilla vacía, aunque sin alias ni formatos hasta que se configuren.
 *
 * `consultaRol` selecciona a qué consulta pertenecen las columnas. En un reporte
 * multinivel el mismo componente pinta la cabecera y el detalle, cada uno con su
 * propio juego de columnas: sin este filtro, ambas rejillas mostrarían todas.
 *
 * Los subtotales de pie se calculan sobre las filas RECIBIDAS, que son las que
 * devolvió la consulta. Si el reporte lleva TOP o el motor recortó el resultado,
 * el total corresponde a lo mostrado, no al universo completo.
 */
export default function DataGrid({ rows, columnas, consultaRol = 'FLAT' }) {
  const defs = useMemo(
    () => (columnas || []).filter(c => (c.ConsultaRol || 'FLAT') === consultaRol),
    [columnas, consultaRol]
  );

  // Si el reporte no trae definicion de columnas, se infieren del dataset.
  const efectivas = useMemo(() => {
    if (defs.length) return defs;
    const first = rows[0] || {};
    return Object.keys(first).map((k, i) => ({
      NombreCampo: k, AliasVisible: k, Formato: 'TEXTO',
      VisiblePorDefecto: true, EsAgrupable: true, AgregacionPie: 'NINGUNA', Orden: i
    }));
  }, [defs, rows]);

  const [visibility, setVisibility] = useState(() =>
    Object.fromEntries(efectivas.map(c => [c.NombreCampo, c.VisiblePorDefecto !== false])));
  const [grouping, setGrouping] = useState([]);
  const [panelCols, setPanelCols] = useState(false);

  const columns = useMemo(() => efectivas.map(c => ({
    accessorKey: c.NombreCampo,
    header: c.AliasVisible || c.NombreCampo,
    enableGrouping: !!c.EsAgrupable,
    meta: { formato: c.Formato, patron: c.FormatoPatron, agregacion: c.AgregacionPie },
    cell: ctx => formatValue(ctx.getValue(), c.Formato, c.FormatoPatron)
  })), [efectivas]);

  const table = useReactTable({
    data: rows, columns,
    state: { columnVisibility: visibility, grouping },
    onColumnVisibilityChange: setVisibility,
    onGroupingChange: setGrouping,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  const agrupables = efectivas.filter(c => c.EsAgrupable);
  const conPie = efectivas.filter(c => c.AgregacionPie && c.AgregacionPie !== 'NINGUNA');

  return (
    <div className="grid-wrap">
      <div className="grid-toolbar">
        <button onClick={() => setPanelCols(v => !v)}>
          Columnas ({Object.values(visibility).filter(Boolean).length}/{efectivas.length})
        </button>
        {agrupables.length > 0 && (
          <label>
            Agrupar por:{' '}
            <select value={grouping[0] || ''} onChange={e => setGrouping(e.target.value ? [e.target.value] : [])}>
              <option value="">(sin agrupar)</option>
              {agrupables.map(c => (
                <option key={c.NombreCampo} value={c.NombreCampo}>{c.AliasVisible || c.NombreCampo}</option>
              ))}
            </select>
          </label>
        )}
        <span className="muted">{rows.length} filas</span>
      </div>

      {panelCols && (
        <div className="col-panel">
          {efectivas.map(c => (
            <label key={c.NombreCampo}>
              <input type="checkbox"
                checked={visibility[c.NombreCampo] !== false}
                onChange={e => setVisibility(v => ({ ...v, [c.NombreCampo]: e.target.checked }))} />
              {c.AliasVisible || c.NombreCampo}
            </label>
          ))}
        </div>
      )}

      <div className="grid-scroll">
        <table className="grid">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id}
                      className={esNumerico(h.column.columnDef.meta?.formato) ? 'num' : ''}
                      onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted()] || ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className={row.getIsGrouped() ? 'group-row' : ''}>
                {row.getVisibleCells().map(cell => {
                  const num = esNumerico(cell.column.columnDef.meta?.formato);
                  if (cell.getIsGrouped()) {
                    return (
                      <td key={cell.id} className="group-cell">
                        <button onClick={row.getToggleExpandedHandler()}>
                          {row.getIsExpanded() ? '▼' : '▶'}
                        </button>{' '}
                        {flexRender(cell.column.columnDef.cell, cell.getContext())} ({row.subRows.length})
                      </td>
                    );
                  }
                  if (cell.getIsAggregated()) {
                    // Subtotal del grupo segun la agregacion configurada.
                    const agg = cell.column.columnDef.meta?.agregacion;
                    const val = calcularAgregacion(
                      row.subRows.map(r => r.original), cell.column.id, agg);
                    return (
                      <td key={cell.id} className={num ? 'num subtotal' : 'subtotal'}>
                        {val == null ? '' : formatValue(val, cell.column.columnDef.meta?.formato,
                          cell.column.columnDef.meta?.patron)}
                      </td>
                    );
                  }
                  if (cell.getIsPlaceholder()) return <td key={cell.id} />;
                  return (
                    <td key={cell.id} className={num ? 'num' : ''}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {conPie.length > 0 && (
            <tfoot>
              <tr>
                {table.getVisibleLeafColumns().map(col => {
                  const def = efectivas.find(c => c.NombreCampo === col.id);
                  const val = calcularAgregacion(rows, col.id, def?.AgregacionPie);
                  return (
                    <td key={col.id} className={esNumerico(def?.Formato) ? 'num' : ''}>
                      {val == null ? '' : formatValue(val, def?.Formato, def?.FormatoPatron)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
