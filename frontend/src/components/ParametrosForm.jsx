import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Renderiza los controles de {PARAMETRO} segun ControlUI:
 *   TEXTO | FECHA | BOOL | LISTA_ESTATICA | LISTA_SQL (poblada desde el backend)
 * Soporta multiseleccion (PermiteMultiple) devolviendo un array.
 */
export default function ParametrosForm({ reporteId, parametros, seleccion, valores, onChange }) {
  const [opcionesSql, setOpcionesSql] = useState({});

  // Carga las listas dinamicas cuando cambia la empresa seleccionada.
  useEffect(() => {
    const listaSql = (parametros || []).filter(p => p.ControlUI === 'LISTA_SQL');
    if (!listaSql.length || seleccion.codEmpresa == null) return;
    let cancelado = false;
    Promise.all(listaSql.map(p =>
      api.opcionesParam(reporteId, p.ParametroId, seleccion)
        .then(ops => [p.ParametroId, ops])
        .catch(() => [p.ParametroId, []])
    )).then(pares => { if (!cancelado) setOpcionesSql(Object.fromEntries(pares)); });
    return () => { cancelado = true; };
  }, [reporteId, parametros, seleccion.codEmpresa, seleccion.ejercicio]);

  const set = (nombre, valor) => onChange({ ...valores, [nombre]: valor });

  const control = (p) => {
    const v = valores[p.Nombre] ?? p.ValorDefault ?? '';
    switch (p.ControlUI) {
      case 'FECHA':
        return <input type="date" value={v} onChange={e => set(p.Nombre, e.target.value)} />;
      case 'BOOL':
        return <input type="checkbox" checked={!!valores[p.Nombre]}
                      onChange={e => set(p.Nombre, e.target.checked)} />;
      case 'LISTA_ESTATICA':
      case 'LISTA_SQL': {
        const ops = p.ControlUI === 'LISTA_SQL'
          ? (opcionesSql[p.ParametroId] || [])
          : (p.opciones || []).map(o => ({ valor: o.Valor, texto: o.Texto }));
        if (p.PermiteMultiple) {
          const sel = Array.isArray(valores[p.Nombre]) ? valores[p.Nombre] : [];
          return (
            <select multiple size={Math.min(6, Math.max(3, ops.length))} value={sel}
              onChange={e => set(p.Nombre, [...e.target.selectedOptions].map(o => o.value))}>
              {ops.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
          );
        }
        return (
          <select value={v} onChange={e => set(p.Nombre, e.target.value)}>
            <option value="">(seleccione)</option>
            {ops.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        );
      }
      default:
        return <input type={p.TipoDato === 'INT' || p.TipoDato === 'DECIMAL' ? 'number' : 'text'}
                      value={v} onChange={e => set(p.Nombre, e.target.value)} />;
    }
  };

  if (!parametros?.length) return null;

  return (
    <div className="param-form">
      {parametros.map(p => (
        <label key={p.ParametroId} className="param">
          <span>{p.Etiqueta}{p.Obligatorio ? ' *' : ''}</span>
          {control(p)}
        </label>
      ))}
    </div>
  );
}
