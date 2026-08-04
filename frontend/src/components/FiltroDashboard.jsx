import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatValue } from '../format';
import { PERIODOS } from '../dashboardUtil';
import Icono from './Icono';

/**
 * Filtro del panel (tipo «slicer»).
 *
 * Dos variantes:
 *  - lista: muestra los valores reales del campo y se marcan los que interesan;
 *  - fecha: periodos relativos («este mes», «últimos 30 días») o un rango.
 *
 * Un filtro puede estar oculto (acota el panel sin ocupar sitio) o visible pero
 * no editable (informa del recorte aplicado sin dejar cambiarlo).
 */
export default function FiltroDashboard({ filtro, valor, onCambio, soloContenido = false }) {
  const editable = filtro.editable !== false;
  return soloContenido
    ? <div className="cuerpo-filtro">
        <Contenido filtro={filtro} valor={valor} onCambio={onCambio} editable={editable} />
      </div>
    : <section className="tarjeta-widget objeto-filtro">
        <header>
          <span className="icono-objeto"><Icono nombre={filtro.tipo === 'fecha' ? 'calendario' : 'filtro'} /></span>
          <strong>{filtro.titulo || 'Filtro'}</strong>
        </header>
        <div className="cuerpo-filtro">
          <Contenido filtro={filtro} valor={valor} onCambio={onCambio} editable={editable} />
        </div>
      </section>;
}

function Contenido({ filtro, valor, onCambio, editable }) {
  if (!filtro.campo) return <p className="muted">Sin campo asignado.</p>;
  return filtro.tipo === 'fecha'
    ? <FiltroFecha filtro={filtro} valor={valor || {}} onCambio={onCambio} editable={editable} />
    : <FiltroLista filtro={filtro} valores={valor || []} onCambio={onCambio} editable={editable} />;
}

/** Periodos relativos y rango concreto. */
function FiltroFecha({ valor, onCambio, editable }) {
  const periodo = valor.periodo || '';
  const usaRango = !periodo && (valor.desde || valor.hasta);

  return (
    <>
      <select value={periodo} disabled={!editable}
              onChange={e => onCambio({ periodo: e.target.value || undefined })}>
        <option value="">Rango concreto…</option>
        {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>

      {!periodo && (
        <div className="rango-fechas">
          <input type="date" value={valor.desde || ''} disabled={!editable}
                 onChange={e => onCambio({ ...valor, periodo: undefined, desde: e.target.value })} />
          <span className="muted">a</span>
          <input type="date" value={valor.hasta || ''} disabled={!editable}
                 onChange={e => onCambio({ ...valor, periodo: undefined, hasta: e.target.value })} />
        </div>
      )}

      {(periodo || usaRango) && editable && (
        <button className="chip-limpiar" onClick={() => onCambio({})}>Quitar ✕</button>
      )}
      {!editable && (
        <p className="muted" style={{ fontSize: 11 }}>Periodo fijado por el diseño del panel.</p>
      )}
    </>
  );
}

/** Lista de valores reales del campo. */
function FiltroLista({ filtro, valores, onCambio, editable }) {
  const [opciones, setOpciones] = useState(null);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const seleccion = valores || [];

  useEffect(() => {
    let vigente = true;
    setError(null);
    api.valoresDe(filtro.campo)
      .then(v => { if (vigente) setOpciones(v.filter(x => x !== null && x !== '')); })
      .catch(e => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [filtro.campo]);

  const alternar = (v) => {
    if (!editable) return;
    onCambio(seleccion.includes(v) ? seleccion.filter(x => x !== v) : [...seleccion, v]);
  };

  const visibles = (opciones || []).filter(o =>
    !busca || String(o).toLowerCase().includes(busca.toLowerCase()));

  if (error) return <div className="widget-error"><Icono nombre="aviso" /> {error}</div>;
  if (!opciones) return <p className="muted">Cargando valores…</p>;

  return (
    <>
      {seleccion.length > 0 && editable && (
        <button className="chip-limpiar" onClick={() => onCambio([])}>
          {seleccion.length} seleccionado{seleccion.length === 1 ? '' : 's'} ✕
        </button>
      )}
      {opciones.length > 10 && (
        <input className="buscador" type="search" placeholder="Buscar…"
               value={busca} onChange={e => setBusca(e.target.value)} />
      )}
      <div className="lista-valores">
        {visibles.map((v, i) => (
          <label key={i} className={`valor-item ${seleccion.includes(v) ? 'activo' : ''}
                                     ${!editable ? 'bloqueado' : ''}`}>
            <input type="checkbox" checked={seleccion.includes(v)} disabled={!editable}
                   onChange={() => alternar(v)} />
            <span>{formatValue(v, filtro.formato || 'TEXTO')}</span>
          </label>
        ))}
        {!visibles.length && <p className="muted">Sin valores.</p>}
      </div>
      {!editable && (
        <p className="muted" style={{ fontSize: 11 }}>Selección fijada por el diseño del panel.</p>
      )}
    </>
  );
}
