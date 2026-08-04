/**
 * Configurador de un objeto del panel: qué mide, cómo se agrupa, qué filtra y
 * cuánto ocupa. Es el equivalente al panel lateral de Power BI.
 *
 * IDEA CENTRAL — el usuario nunca escribe SQL. Elige DIMENSIONES (por qué
 * agrupar: almacén, mes, familia) y MÉTRICAS (qué medir: importe, unidades), y
 * el servidor arma la consulta a partir del catálogo.
 *
 * CAMPOS ALCANZABLES. Las listas no muestran el catálogo entero: solo lo que se
 * puede combinar con lo ya elegido, siguiendo las relaciones declaradas
 * (`camposAlcanzables` en catalogoUtil). Así no se ofrece una combinación que
 * el motor rechazaría después por no existir un camino entre los orígenes.
 *
 * SELECCIÓN EN DOS PASOS. Origen primero, atributo después. Con el catálogo
 * completo en un solo desplegable la búsqueda se hacía interminable —fue una
 * corrección pedida tras probar la interfaz—, y por eso `FilaFiltro` obliga a
 * acotar el origen antes de ofrecer atributos, con buscador cuando pasan de ocho.
 *
 * La vista previa se pinta con el MISMO componente que el panel real
 * (`WidgetView`), de modo que lo que se configura es exactamente lo que se verá.
 */
import { useMemo, useState } from 'react';
import WidgetView, { TIPOS_WIDGET } from './WidgetView';
import { camposAlcanzables, origenesDeConsulta } from '../catalogoUtil';
import { ANCHOS, ALTOS } from '../dashboardUtil';

const OPERADORES = [
  { id: 'IGUAL', nombre: 'igual a' },
  { id: 'DISTINTO', nombre: 'distinto de' },
  { id: 'MAYOR', nombre: 'mayor que' },
  { id: 'MENOR', nombre: 'menor que' },
  { id: 'CONTIENE', nombre: 'contiene' },
  { id: 'ENTRE', nombre: 'entre' }
];

/**
 * Una condición de filtro, en dos pasos: primero el origen y después el
 * atributo. Elegir de una lista con todos los campos del catálogo resultaba
 * inmanejable; acotando por origen la lista queda corta, y si aun así es larga
 * aparece un buscador.
 */
function FilaFiltro({ filtro, origenes, onCambio, onQuitar }) {
  // Si ya hay campo, el origen se deduce de él; si no, se recuerda aquí.
  const origenDelCampo = filtro.campo ? filtro.campo.split('.')[0] : '';
  const [origenSel, setOrigenSel] = useState(origenDelCampo);
  const [busca, setBusca] = useState('');

  const origen = origenes.find(o => o.clave === (origenDelCampo || origenSel));
  const campos = origen?.campos || [];
  const visibles = campos.filter(c =>
    !busca || c.etiqueta.toLowerCase().includes(busca.toLowerCase()));
  const campoSel = campos.find(c => c.clave === filtro.campo);

  const cambiarOrigen = (clave) => {
    setOrigenSel(clave);
    setBusca('');
    onCambio({ campo: '', valor: '', desde: '', hasta: '' });   // el atributo ya no aplica
  };

  const tipoInput = campoSel?.tipoDato === 'DATE' || campoSel?.tipoDato === 'DATETIME'
    ? 'date' : (campoSel?.rol === 'METRICA' ? 'number' : 'text');

  return (
    <div className="filtro-fila">
      <select value={origenDelCampo || origenSel}
              onChange={e => cambiarOrigen(e.target.value)}
              title="Origen de datos sobre el que filtrar">
        <option value="">1. Origen…</option>
        {origenes.map(o => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
      </select>

      {campos.length > 8 && (
        <input className="busca-atributo" type="search" placeholder="buscar atributo…"
               value={busca} onChange={e => setBusca(e.target.value)} />
      )}

      <select value={filtro.campo || ''} disabled={!origen}
              onChange={e => onCambio({ campo: e.target.value })}
              title={origen ? 'Atributo' : 'Elija primero un origen'}>
        <option value="">{origen ? '2. Atributo…' : '(elija origen)'}</option>
        {visibles.map(c => (
          <option key={c.clave} value={c.clave}>
            {c.etiqueta}{c.rol === 'METRICA' ? ' (medida)' : ''}
          </option>
        ))}
      </select>

      <select value={filtro.operador} disabled={!filtro.campo}
              onChange={e => onCambio({ operador: e.target.value })}>
        {OPERADORES.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>

      {filtro.operador === 'ENTRE' ? (
        <>
          <input value={filtro.desde || ''} placeholder="desde" type={tipoInput}
                 disabled={!filtro.campo}
                 onChange={e => onCambio({ desde: e.target.value })} />
          <input value={filtro.hasta || ''} placeholder="hasta" type={tipoInput}
                 disabled={!filtro.campo}
                 onChange={e => onCambio({ hasta: e.target.value })} />
        </>
      ) : (
        <input value={filtro.valor || ''} placeholder="valor" type={tipoInput}
               disabled={!filtro.campo}
               onChange={e => onCambio({ valor: e.target.value })} />
      )}

      <button onClick={onQuitar} title="Quitar filtro">✕</button>
    </div>
  );
}

/**
 * Configurador de un widget: el usuario elige campos del catálogo, nunca SQL.
 * Muestra la vista previa en vivo para que vea el resultado mientras ajusta.
 */
export default function WidgetEditor({ widget, catalogo, onCambio, onCerrar, onEliminar }) {
  const [tab, setTab] = useState('CAMPOS');
  const consulta = widget.consulta || { dimensiones: [], metricas: [], filtros: [] };

  // Campos disponibles: los de los orígenes ya usados en el widget MÁS los que
  // se alcanzan por relación. Así, al elegir «Importe» de VENTASDETALLE
  // aparecen de inmediato la descripción o la familia del artículo, sin que el
  // usuario tenga que saber que hay otra tabla detrás.
  const { dimensiones, metricas, porClave } = useMemo(() => {
    const usados = origenesDeConsulta(consulta);
    const { campos } = camposAlcanzables(catalogo, usados);
    const dims = [], mets = [], mapa = new Map();
    for (const c of campos) {
      mapa.set(c.clave, c);
      (c.rol === 'METRICA' ? mets : dims).push(c);
    }
    return { dimensiones: dims, metricas: mets, porClave: mapa };
  }, [catalogo, JSON.stringify(consulta.dimensiones), JSON.stringify(consulta.metricas)]);

  const set = (cambios) => onCambio({ ...widget, ...cambios });
  const setConsulta = (cambios) => set({ consulta: { ...consulta, ...cambios } });

  const alternar = (lista, clave) => {
    const actual = consulta[lista] || [];
    setConsulta({
      [lista]: actual.includes(clave) ? actual.filter(x => x !== clave) : [...actual, clave]
    });
  };

  const añadirFiltro = () => setConsulta({
    filtros: [...(consulta.filtros || []), { campo: '', operador: 'IGUAL', valor: '' }]
  });
  const setFiltro = (i, cambios) => setConsulta({
    filtros: (consulta.filtros || []).map((f, j) => (j === i ? { ...f, ...cambios } : f))
  });
  const quitarFiltro = (i) => setConsulta({
    filtros: (consulta.filtros || []).filter((_, j) => j !== i)
  });

  /** Agrupa los campos por origen y permite acotar por origen o por texto. */
  const Selector = ({ campos, lista, titulo, ayuda }) => {
    const [busca, setBusca] = useState('');
    const [origenFiltro, setOrigenFiltro] = useState('');
    const origenesDisponibles = [...new Set(campos.map(c => c.origen))];
    const visibles = campos.filter(c =>
      (!origenFiltro || c.origen === origenFiltro) &&
      (!busca || c.etiqueta.toLowerCase().includes(busca.toLowerCase()) ||
       c.origenNombre.toLowerCase().includes(busca.toLowerCase())));
    const grupos = [...new Set(visibles.map(c => c.origen))];
    return (
      <div className="selector-campos">
        <div className="selector-cab">
          <strong>{titulo}</strong>
          <span className="muted">{(consulta[lista] || []).length} seleccionados</span>
        </div>
        <p className="muted" style={{ margin: '0 0 6px' }}>{ayuda}</p>
        <div className="filtro-origen">
          <select value={origenFiltro} onChange={e => setOrigenFiltro(e.target.value)}>
            <option value="">Todos los orígenes</option>
            {origenesDisponibles.map(o => (
              <option key={o} value={o}>
                {campos.find(c => c.origen === o)?.origenNombre}
              </option>
            ))}
          </select>
          <input className="buscador" type="search" placeholder="Buscar campo…"
                 value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="lista-campos">
          {grupos.map(g => (
            <div key={g} className="grupo-campos">
              <div className="grupo-titulo">{campos.find(c => c.origen === g)?.origenNombre}</div>
              {visibles.filter(c => c.origen === g).map(c => (
                <label key={c.clave} className="campo-item"
                       title={c.viaRelacion
                         ? `Disponible a través de la relación con ${c.desde}`
                         : (c.descripcion || '')}>
                  <input type="checkbox" checked={(consulta[lista] || []).includes(c.clave)}
                         onChange={() => alternar(lista, c.clave)} />
                  <span>{c.etiqueta}</span>
                  {c.viaRelacion && <span className="tipo-tag tipo-multinivel" title="Campo relacionado">🔗</span>}
                  {c.formato === 'MONEDA' && <span className="tipo-tag tipo-dashboard">moneda</span>}
                </label>
              ))}
            </div>
          ))}
          {!visibles.length && <p className="muted">Ningún campo coincide.</p>}
        </div>
      </div>
    );
  };

  const camposElegidos = [...(consulta.dimensiones || []), ...(consulta.metricas || [])];

  return (
    <div className="widget-editor">
      <div className="widget-editor-cab">
        <input className="titulo-widget" value={widget.titulo || ''}
               placeholder="Título del widget"
               onChange={e => set({ titulo: e.target.value })} />
        <div className="tipos-widget">
          {TIPOS_WIDGET.map(t => (
            <button key={t.id} className={widget.tipo === t.id ? 'primary' : ''}
                    title={t.nombre} onClick={() => set({ tipo: t.id })}>
              {t.icono}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onEliminar} title="Eliminar widget">🗑</button>
        <button onClick={onCerrar}>Listo</button>
      </div>

      <div className="grid-toolbar">
        <button className={tab === 'CAMPOS' ? 'primary' : ''} onClick={() => setTab('CAMPOS')}>
          Campos
        </button>
        <button className={tab === 'FILTROS' ? 'primary' : ''} onClick={() => setTab('FILTROS')}>
          Filtros ({(consulta.filtros || []).length})
        </button>
        <button className={tab === 'OPCIONES' ? 'primary' : ''} onClick={() => setTab('OPCIONES')}>
          Opciones
        </button>
      </div>

      {tab === 'CAMPOS' && (
        <div className="dos-columnas">
          <Selector campos={dimensiones} lista="dimensiones" titulo="Agrupar por"
                    ayuda="Cómo se reparten los datos: fecha, artículo, tienda…" />
          <Selector campos={metricas} lista="metricas" titulo="Medir"
                    ayuda="Qué se calcula: importe, unidades, nº de documentos…" />
        </div>
      )}

      {tab === 'FILTROS' && (
        <div className="filtros-widget">
          {(consulta.filtros || []).map((f, i) => (
            <FilaFiltro key={i} filtro={f} indice={i} origenes={catalogo?.origenes || []}
                        onCambio={cambios => setFiltro(i, cambios)}
                        onQuitar={() => quitarFiltro(i)} />
          ))}
          <button onClick={añadirFiltro}>+ Añadir filtro</button>
          {(consulta.filtros || []).length > 0 && (
            <p className="muted">
              Los filtros incompletos se ignoran: el gráfico no cambia hasta que elijas
              atributo y valor.
            </p>
          )}
        </div>
      )}

      {tab === 'OPCIONES' && (
        <div className="filtros">
          <label className="param">
            <span>Ordenar por</span>
            <select value={consulta.orden?.campo || ''}
                    onChange={e => setConsulta({ orden: e.target.value
                      ? { campo: e.target.value, direccion: consulta.orden?.direccion || 'DESC' }
                      : null })}>
              <option value="">(sin ordenar)</option>
              {camposElegidos.map(c =>
                <option key={c} value={c}>{porClave.get(c)?.etiqueta || c}</option>)}
            </select>
          </label>
          <label className="param">
            <span>Dirección</span>
            <select value={consulta.orden?.direccion || 'DESC'}
                    disabled={!consulta.orden?.campo}
                    onChange={e => setConsulta({ orden: { ...consulta.orden, direccion: e.target.value } })}>
              <option value="DESC">Mayor a menor</option>
              <option value="ASC">Menor a mayor</option>
            </select>
          </label>
          <label className="param">
            <span>Máximo de filas</span>
            <input type="number" min="1" max="20000" value={consulta.limite || 20}
                   onChange={e => setConsulta({ limite: Number(e.target.value) })} />
          </label>
          <label className="param">
            <span>Ancho</span>
            <select value={widget.ancho || 'medio'} onChange={e => set({ ancho: e.target.value })}>
              {ANCHOS.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="param">
            <span>Alto</span>
            <select value={widget.alto || 'medio'} onChange={e => set({ alto: e.target.value })}>
              {ALTOS.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
        </div>
      )}

      {tab === 'OPCIONES' && (
        <>
          <h3>Cómo se relaciona con el resto del panel</h3>
          <div className="perfiles-check">
            <label className="perfil-item" title="Al pulsar en él, filtra a los demás objetos">
              <input type="checkbox" checked={widget.emite !== false}
                     disabled={!['bar', 'line', 'pie', 'tabla'].includes(widget.tipo)}
                     onChange={e => set({ emite: e.target.checked })} />
              <span>Al pulsarlo, filtra a los demás</span>
            </label>
            <label className="perfil-item" title="Los filtros del panel le afectan">
              <input type="checkbox" checked={widget.recibe !== false}
                     onChange={e => set({ recibe: e.target.checked })} />
              <span>Le afectan los filtros del panel</span>
            </label>
          </div>
          <p className="muted">
            Desmarca «le afectan los filtros» para dejar un objeto fijo — por ejemplo un total
            general que sirva de referencia mientras se filtra el resto.
          </p>
        </>
      )}

      <h3>Vista previa</h3>
      <div className="widget-preview">
        <WidgetView widget={widget} alto={260} />
      </div>
    </div>
  );
}
