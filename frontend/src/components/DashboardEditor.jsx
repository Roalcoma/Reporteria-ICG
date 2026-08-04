import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import WidgetView from './WidgetView';
import WidgetEditor from './WidgetEditor';
import FiltroDashboard from './FiltroDashboard';
import Icono from './Icono';
import {
  ANCHOS, ALTOS, PERIODOS, LAYOUTS, columnasDe, pixelesDe, normalizar,
  filtrosPara, reordenar, valorEfectivo
} from '../dashboardUtil';

const nuevoId = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}`;

/** Objetos que se pueden añadir al panel. */
const PALETA = [
  { tipo: 'bar',    nombre: 'Barras',    icono: 'barras',    clase: 'grafico' },
  { tipo: 'line',   nombre: 'Líneas',    icono: 'lineas',    clase: 'grafico' },
  { tipo: 'pie',    nombre: 'Torta',     icono: 'torta',     clase: 'grafico' },
  { tipo: 'tabla',  nombre: 'Tabla',     icono: 'tabla',     clase: 'grafico' },
  { tipo: 'kpi',    nombre: 'Indicador', icono: 'indicador', clase: 'grafico' },
  { tipo: 'filtro', nombre: 'Filtro',    icono: 'filtro',    clase: 'filtro'  }
];
const iconoDe = (tipo) => PALETA.find(p => p.tipo === tipo)?.icono || 'barras';
// Objetos que, al pulsarlos, pueden filtrar al resto del panel.
const INTERACTIVOS = ['bar', 'line', 'pie', 'tabla'];

const nuevoWidget = (tipo, tabId) => ({
  id: nuevoId('w'), titulo: PALETA.find(p => p.tipo === tipo)?.nombre || 'Gráfico',
  tipo, tabId, ancho: tipo === 'kpi' ? 'tercio' : 'medio', alto: 'medio',
  emite: true, recibe: true,
  consulta: { dimensiones: [], metricas: [], filtros: [], limite: 20 }
});

/**
 * Panel de análisis: pestañas con objetos (gráficos, tablas, indicadores y
 * filtros) que se reordenan arrastrando y se comunican entre sí.
 */
export default function DashboardEditor({ dashboardId, onVolver, onGuardado, puedeCrear }) {
  const [d, setD] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [compartir, setCompartir] = useState(false);
  const [perfiles, setPerfiles] = useState([]);
  const [perfilesSel, setPerfilesSel] = useState(new Set());

  const [tabActiva, setTabActiva] = useState(null);
  const [arrastrando, setArrastrando] = useState(null);
  // Estado de análisis (no se guarda): filtros marcados y selección por clic.
  const [valoresFiltro, setValoresFiltro] = useState({});
  const [seleccion, setSeleccion] = useState(null);

  useEffect(() => { api.catalogoDashboards().then(setCatalogo).catch(e => setError(e.message)); }, []);

  useEffect(() => {
    if (dashboardId == null) {
      setD({ dashboard: { Nombre: 'Nuevo panel', Descripcion: '', Visibilidad: 'PRIVADO',
        configuracion: normalizar({}) }, puedeEditar: true, compartidos: [] });
      setModoEdicion(true);
      return;
    }
    api.dashboard(dashboardId)
      .then(r => {
        setD({ ...r, dashboard: { ...r.dashboard, configuracion: normalizar(r.dashboard.configuracion) } });
        setPerfilesSel(new Set(r.compartidos.filter(c => c.PerfilId).map(c => c.PerfilId)));
      })
      .catch(e => setError(e.message));
  }, [dashboardId]);

  useEffect(() => { if (compartir) api.perfiles().then(setPerfiles).catch(() => {}); }, [compartir]);

  const cfg = d?.dashboard?.configuracion;
  const tabs = cfg?.tabs || [];
  const tabId = tabActiva || tabs[0]?.id;

  const widgets = useMemo(() => (cfg?.widgets || []).filter(w => w.tabId === tabId), [cfg, tabId]);
  const filtros = useMemo(() => (cfg?.filtros || []).filter(f => f.tabId === tabId), [cfg, tabId]);
  // Los filtros ocultos siguen aplicándose: acotan el panel sin ocupar espacio.
  const filtrosVisibles = useMemo(
    () => filtros.filter(f => f.visible !== false || modoEdicion), [filtros, modoEdicion]);

  if (error && !d) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">Cargando…</p>;

  const setCfg = (cambios) => setD({
    ...d, dashboard: { ...d.dashboard, configuracion: { ...cfg, ...cambios } }
  });
  const setWidgets = (w) => setCfg({ widgets: w });
  const setFiltros = (f) => setCfg({ filtros: f });
  const setCampo = (campo, valor) => setD({ ...d, dashboard: { ...d.dashboard, [campo]: valor } });
  const actualizarWidget = (w) => setWidgets(cfg.widgets.map(x => (x.id === w.id ? w : x)));
  const actualizarFiltro = (f) => setFiltros(cfg.filtros.map(x => (x.id === f.id ? f : x)));

  const añadirObjeto = (tipo) => {
    if (tipo === 'filtro') {
      const f = { id: nuevoId('f'), campo: '', titulo: 'Filtro', tabId,
        ancho: 'tercio', alto: 'medio', afecta: 'TODOS' };
      setFiltros([...(cfg.filtros || []), f]);
      setEditando({ tipo: 'filtro', id: f.id });
    } else {
      const w = nuevoWidget(tipo, tabId);
      setWidgets([...(cfg.widgets || []), w]);
      setEditando({ tipo: 'widget', id: w.id });
    }
  };

  // --- Pestañas ---
  const añadirTab = () => {
    const nombre = prompt('Nombre de la pestaña:', `Pestaña ${tabs.length + 1}`);
    if (!nombre?.trim()) return;
    const t = { id: nuevoId('t'), nombre: nombre.trim() };
    setCfg({ tabs: [...tabs, t] });
    setTabActiva(t.id);
  };
  const renombrarTab = (t) => {
    const nombre = prompt('Nuevo nombre:', t.nombre);
    if (nombre?.trim()) setCfg({ tabs: tabs.map(x => (x.id === t.id ? { ...x, nombre: nombre.trim() } : x)) });
  };
  const borrarTab = (t) => {
    if (tabs.length === 1) { setError('El panel debe tener al menos una pestaña.'); return; }
    const objetos = (cfg.widgets || []).filter(w => w.tabId === t.id).length +
                    (cfg.filtros || []).filter(f => f.tabId === t.id).length;
    if (!confirm(`¿Eliminar la pestaña "${t.nombre}"${objetos ? ` y sus ${objetos} objeto(s)` : ''}?`)) return;
    setCfg({
      tabs: tabs.filter(x => x.id !== t.id),
      widgets: (cfg.widgets || []).filter(w => w.tabId !== t.id),
      filtros: (cfg.filtros || []).filter(f => f.tabId !== t.id)
    });
    setTabActiva(tabs.find(x => x.id !== t.id)?.id);
  };

  // --- Reordenar arrastrando ---
  const soltarSobre = (destinoId, esFiltro) => {
    if (!arrastrando || arrastrando.id === destinoId) return;
    if (arrastrando.esFiltro !== esFiltro) return;   // no se mezclan filtros y gráficos
    if (esFiltro) setFiltros(reordenar(cfg.filtros, arrastrando.id, destinoId));
    else setWidgets(reordenar(cfg.widgets, arrastrando.id, destinoId));
    setArrastrando(null);
  };

  const guardar = async () => {
    setGuardando(true); setError(null); setOk(null);
    try {
      const cuerpo = {
        nombre: d.dashboard.Nombre, descripcion: d.dashboard.Descripcion,
        visibilidad: d.dashboard.Visibilidad, area: d.dashboard.Area || 'GESTION',
        configuracion: cfg
      };
      if (dashboardId == null) {
        const r = await api.crearDashboard(cuerpo);
        setOk('Panel creado.');
        onGuardado && onGuardado(r.DashboardId);
      } else {
        await api.actualizarDashboard(dashboardId, cuerpo);
        setOk('Cambios guardados.');
      }
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const guardarCompartir = async () => {
    try {
      await api.compartirDashboard(dashboardId, { perfiles: [...perfilesSel], usuarios: [] });
      setOk('Compartido actualizado.'); setCompartir(false);
    } catch (e) { setError(e.message); }
  };

  const widgetEnEdicion = editando?.tipo === 'widget'
    ? cfg.widgets.find(w => w.id === editando.id) : null;
  const filtroEnEdicion = editando?.tipo === 'filtro'
    ? cfg.filtros.find(f => f.id === editando.id) : null;

  const hayInteraccion = Object.values(valoresFiltro).some(v => v?.length) || seleccion;

  /** Envoltorio común de cada objeto: cabecera, arrastre y tamaño. */
  const Tarjeta = ({ objeto, esFiltro, children }) => (
    <section
      className={`tarjeta-widget ${arrastrando?.id === objeto.id ? 'arrastrando' : ''}`}
      style={{ gridColumn: `span ${columnasDe(objeto.ancho)}` }}
      draggable={modoEdicion}
      onDragStart={() => setArrastrando({ id: objeto.id, esFiltro })}
      onDragEnd={() => setArrastrando(null)}
      onDragOver={(e) => { if (modoEdicion) e.preventDefault(); }}
      onDrop={() => soltarSobre(objeto.id, esFiltro)}>
      <header>
        {modoEdicion && <span className="asa" title="Arrastra para reordenar"><Icono nombre="arrastrar" /></span>}
        <span className="icono-objeto"><Icono nombre={iconoDe(objeto.tipo || 'filtro')} /></span>
        <strong>{objeto.titulo || 'Sin título'}</strong>
        {!esFiltro && objeto.recibe === false && (
          <span className="tipo-tag" title="No le afectan los filtros del panel">sin filtros</span>
        )}
        {esFiltro && objeto.visible === false && (
          <span className="tipo-tag" title="Se aplica, pero no se muestra al usuario">oculto</span>
        )}
        {esFiltro && objeto.editable === false && (
          <span className="tipo-tag" title="Visible pero no modificable">fijo</span>
        )}
        {modoEdicion && (
          <span className="reporte-acciones" style={{ display: 'flex' }}>
            <button onClick={() => setEditando({ tipo: esFiltro ? 'filtro' : 'widget', id: objeto.id })}
                    title="Configurar">✎</button>
            <button onClick={() => {
              if (!confirm('¿Eliminar este objeto?')) return;
              if (esFiltro) setFiltros(cfg.filtros.filter(x => x.id !== objeto.id));
              else setWidgets(cfg.widgets.filter(x => x.id !== objeto.id));
            }} title="Eliminar">🗑</button>
          </span>
        )}
      </header>
      {children}
    </section>
  );

  return (
    <div className="viewer panel">
      <header className="viewer-head panel-cab">
        {modoEdicion ? (
          <input className="titulo-dashboard" value={d.dashboard.Nombre}
                 onChange={e => setCampo('Nombre', e.target.value)} />
        ) : (
          <div>
            <h2>{d.dashboard.Nombre}</h2>
            {d.dashboard.Descripcion && <p className="muted">{d.dashboard.Descripcion}</p>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {hayInteraccion && (
          <button className="chip-limpiar grande"
                  onClick={() => { setValoresFiltro({}); setSeleccion(null); }}>
            Quitar filtros ✕
          </button>
        )}
        <button onClick={() => setRecarga(n => n + 1)} title="Volver a consultar"><Icono nombre="recargar" titulo="Actualizar" /></button>
        {d.puedeEditar && puedeCrear && (
          <button className={modoEdicion ? 'primary' : ''}
                  onClick={() => { setModoEdicion(v => !v); setEditando(null); }}>
            {modoEdicion ? 'Terminar' : 'Editar'}
          </button>
        )}
        {modoEdicion && (
          <button className="primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        {dashboardId != null && d.puedeEditar && (
          <button onClick={() => setCompartir(v => !v)}>Compartir</button>
        )}
        <button onClick={onVolver}>Volver</button>
      </header>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok" style={{ margin: '8px 0' }}>{ok}</div>}

      {/* Pestañas */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab ${t.id === tabId ? 'activa' : ''}`}
                  onClick={() => setTabActiva(t.id)}
                  onDoubleClick={() => modoEdicion && renombrarTab(t)}
                  title={modoEdicion ? 'Doble clic para renombrar' : ''}>
            {t.nombre}
            {modoEdicion && tabs.length > 1 && (
              <span className="cerrar-tab" title="Eliminar pestaña"
                    onClick={(e) => { e.stopPropagation(); borrarTab(t); }}>✕</span>
            )}
          </button>
        ))}
        {modoEdicion && <button className="tab nueva" onClick={añadirTab}>+ Pestaña</button>}
      </div>

      {seleccion && (
        <div className="barra-seleccion">
          Filtrando por <strong>{seleccion.etiqueta}: {String(seleccion.valor)}</strong>
          <button onClick={() => setSeleccion(null)}>quitar</button>
        </div>
      )}

      {compartir && (
        <div className="import-preview">
          <div className="import-cab"><strong>Compartir con perfiles</strong></div>
          {perfiles.length === 0 ? <p className="muted">No hay perfiles creados.</p> : (
            <div className="perfiles-check">
              {perfiles.map(p => (
                <label key={p.PerfilId} className="perfil-item">
                  <input type="checkbox" checked={perfilesSel.has(p.PerfilId)}
                         onChange={() => setPerfilesSel(s => {
                           const n = new Set(s);
                           n.has(p.PerfilId) ? n.delete(p.PerfilId) : n.add(p.PerfilId);
                           return n;
                         })} />
                  <span>{p.Nombre}</span>
                </label>
              ))}
            </div>
          )}
          <div className="acciones">
            <button className="primary" onClick={guardarCompartir}>Guardar</button>
            <button onClick={() => setCompartir(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {modoEdicion && !widgetEnEdicion && !filtroEnEdicion && (
        <>
          <div className="paleta">
            <span className="paleta-titulo">Añadir objeto</span>
            {PALETA.map(p => (
              <button key={p.tipo} className={`objeto-boton ${p.clase}`}
                      onClick={() => añadirObjeto(p.tipo)}>
                <span className="objeto-icono"><Icono nombre={p.icono} tam={19} /></span>
                <span>{p.nombre}</span>
              </button>
            ))}
          </div>
          <div className="paleta">
            <span className="paleta-titulo">Disposición</span>
            {LAYOUTS.map(l => (
              <button key={l.id} className="objeto-boton" title={`Aplicar: ${l.nombre}`}
                      onClick={() => {
                        // Se aplica solo a los objetos de la pestaña activa.
                        const enTab = new Set(widgets.map(w => w.id));
                        const nuevos = l.aplicar(widgets);
                        setWidgets(cfg.widgets.map(w =>
                          enTab.has(w.id) ? nuevos.find(n => n.id === w.id) : w));
                      }}>
                {/* Símbolos geométricos, no emoji: heredan el color del texto
                    y dibujan la forma de la disposición mejor que un icono. */}
                <span className="objeto-icono glifo" aria-hidden="true">{l.icono}</span>
                <span>{l.nombre}</span>
              </button>
            ))}
          </div>
          <label className="param" style={{ maxWidth: 460, marginBottom: 10 }}>
            <span>Descripción del panel</span>
            <input value={d.dashboard.Descripcion || ''}
                   onChange={e => setCampo('Descripcion', e.target.value)} />
          </label>
        </>
      )}

      {widgetEnEdicion ? (
        <WidgetEditor
          widget={widgetEnEdicion} catalogo={catalogo}
          objetos={cfg.widgets.filter(w => w.id !== widgetEnEdicion.id)}
          onCambio={actualizarWidget}
          onCerrar={() => setEditando(null)}
          onEliminar={() => {
            if (!confirm('¿Eliminar este objeto?')) return;
            setWidgets(cfg.widgets.filter(x => x.id !== editando.id));
            setEditando(null);
          }} />
      ) : filtroEnEdicion ? (
        <ConfigurarFiltro
          filtro={filtroEnEdicion} catalogo={catalogo}
          objetos={cfg.widgets.filter(w => w.tabId === filtroEnEdicion.tabId)}
          onCambio={actualizarFiltro}
          onCerrar={() => setEditando(null)}
          onEliminar={() => {
            setFiltros(cfg.filtros.filter(x => x.id !== editando.id));
            setEditando(null);
          }} />
      ) : (
        <div className="rejilla-panel">
          {filtrosVisibles.map(f => (
            <Tarjeta key={f.id} objeto={f} esFiltro>
              <FiltroDashboard filtro={f} valor={valorEfectivo(f, valoresFiltro)} soloContenido
                onCambio={(val) => setValoresFiltro(v => ({ ...v, [f.id]: val }))} />
            </Tarjeta>
          ))}
          {widgets.map(w => (
            <Tarjeta key={w.id} objeto={w} esFiltro={false}>
              <WidgetView widget={w} recarga={recarga} alto={pixelesDe(w.alto)}
                filtrosExtra={filtrosPara(w.id, w, cfg.filtros, valoresFiltro, seleccion)}
                seleccionActiva={seleccion}
                onSeleccionar={INTERACTIVOS.includes(w.tipo) && w.emite !== false
                  ? (sel) => setSeleccion(sel ? { ...sel, origenId: w.id } : null)
                  : null} />
            </Tarjeta>
          ))}
          {!widgets.length && !filtros.length && (
            <p className="muted" style={{ gridColumn: '1 / -1' }}>
              {modoEdicion
                ? 'Añade tu primer objeto desde la paleta de arriba.'
                : 'Esta pestaña todavía no tiene objetos.'}
            </p>
          )}
        </div>
      )}

      {!modoEdicion && widgets.some(w => INTERACTIVOS.includes(w.tipo) && w.emite !== false) && (
        <p className="muted pista">
          Pulsa sobre una barra o porción para filtrar el resto del panel por ese valor.
        </p>
      )}
      {modoEdicion && !widgetEnEdicion && !filtroEnEdicion && (widgets.length + filtros.length) > 1 && (
        <p className="muted pista">
          Arrastra los objetos por el asa para reordenarlos.
        </p>
      )}
    </div>
  );
}

/** Ajustes de un objeto de filtro: campo, presentación, tamaño y alcance. */
function ConfigurarFiltro({ filtro, catalogo, objetos, onCambio, onCerrar, onEliminar }) {
  const [origenSel, setOrigenSel] = useState(filtro.campo ? filtro.campo.split('.')[0] : '');
  const origen = (catalogo?.origenes || []).find(o => o.clave === origenSel);
  const dims = (origen?.campos || []).filter(c => c.rol === 'DIMENSION');
  const afectaTodos = filtro.afecta === 'TODOS' || !filtro.afecta;
  const esFecha = filtro.tipo === 'fecha';

  return (
    <div className="widget-editor">
      <div className="widget-editor-cab">
        <span className="objeto-icono"><Icono nombre="filtro" /></span>
        <input className="titulo-widget" value={filtro.titulo || ''} placeholder="Título del filtro"
               onChange={e => onCambio({ ...filtro, titulo: e.target.value })} />
        <div style={{ flex: 1 }} />
        <button onClick={onEliminar} title="Eliminar">🗑</button>
        <button className="primary" onClick={onCerrar}>Listo</button>
      </div>

      <div className="filtros">
        <label className="param">
          <span>1. Origen de datos</span>
          <select value={origenSel} onChange={e => {
            setOrigenSel(e.target.value); onCambio({ ...filtro, campo: '' });
          }}>
            <option value="">(elegir)</option>
            {(catalogo?.origenes || []).map(o =>
              <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
          </select>
        </label>
        <label className="param">
          <span>2. Atributo</span>
          <select value={filtro.campo || ''} disabled={!origen}
                  onChange={e => {
                    const campo = dims.find(c => c.clave === e.target.value);
                    // Un campo de fecha activa el filtro de periodos automáticamente.
                    const tipo = ['DATE', 'DATETIME'].includes(campo?.tipoDato) ? 'fecha' : 'lista';
                    onCambio({ ...filtro, campo: e.target.value, formato: campo?.formato, tipo,
                      titulo: filtro.titulo && filtro.titulo !== 'Filtro'
                        ? filtro.titulo : (campo?.etiqueta || 'Filtro') });
                  }}>
            <option value="">{origen ? '(elegir)' : '(elija origen)'}</option>
            {dims.map(c => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}{['DATE', 'DATETIME'].includes(c.tipoDato) ? ' 🗓' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="param">
          <span>Ancho</span>
          <select value={filtro.ancho || 'tercio'}
                  onChange={e => onCambio({ ...filtro, ancho: e.target.value })}>
            {ANCHOS.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
      </div>

      <h3>Presentación</h3>
      <div className="perfiles-check">
        <label className="perfil-item" title="Si se oculta, el filtro se sigue aplicando">
          <input type="checkbox" checked={filtro.visible !== false}
                 onChange={e => onCambio({ ...filtro, visible: e.target.checked })} />
          <span>Visible en el panel</span>
        </label>
        <label className="perfil-item" title="Si no es editable, el usuario no puede cambiarlo">
          <input type="checkbox" checked={filtro.editable !== false}
                 disabled={filtro.visible === false}
                 onChange={e => onCambio({ ...filtro, editable: e.target.checked })} />
          <span>El usuario puede cambiarlo</span>
        </label>
      </div>
      <p className="muted">
        Un filtro <strong>oculto</strong> acota el panel sin ocupar espacio. Uno visible pero
        <strong> no editable</strong> deja ver qué recorte se aplicó, sin permitir tocarlo.
      </p>

      {(filtro.visible === false || filtro.editable === false) && (
        <>
          <h3>Valor fijo</h3>
          {esFecha ? (
            <div className="filtros">
              <label className="param">
                <span>Periodo</span>
                <select value={filtro.valorFijo?.periodo || ''}
                        onChange={e => onCambio({ ...filtro,
                          valorFijo: e.target.value ? { periodo: e.target.value } : {} })}>
                  <option value="">(sin filtrar)</option>
                  {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <span className="muted">
                Los periodos son relativos: «este mes» se recalcula cada vez que se abre el panel.
              </span>
            </div>
          ) : (
            <div className="widget-preview" style={{ maxWidth: 320 }}>
              <FiltroDashboard filtro={{ ...filtro, editable: true }}
                valor={filtro.valorFijo || []}
                onCambio={(v) => onCambio({ ...filtro, valorFijo: v })} soloContenido />
            </div>
          )}
        </>
      )}

      <h3>¿A qué objetos afecta?</h3>
      <div className="perfiles-check">
        <label className="perfil-item">
          <input type="radio" checked={afectaTodos}
                 onChange={() => onCambio({ ...filtro, afecta: 'TODOS' })} />
          <span>Todo el panel</span>
        </label>
        <label className="perfil-item">
          <input type="radio" checked={!afectaTodos}
                 onChange={() => onCambio({ ...filtro, afecta: [] })} />
          <span>Solo los que elija</span>
        </label>
      </div>
      {!afectaTodos && (
        <div className="perfiles-check" style={{ marginTop: 6 }}>
          {objetos.length === 0 && <p className="muted">No hay otros objetos en esta pestaña.</p>}
          {objetos.map(o => (
            <label key={o.id} className="perfil-item">
              <input type="checkbox"
                     checked={Array.isArray(filtro.afecta) && filtro.afecta.includes(o.id)}
                     onChange={() => {
                       const act = Array.isArray(filtro.afecta) ? filtro.afecta : [];
                       onCambio({ ...filtro, afecta: act.includes(o.id)
                         ? act.filter(x => x !== o.id) : [...act, o.id] });
                     }} />
              <span>{o.titulo}</span>
            </label>
          ))}
        </div>
      )}

      {filtro.campo && filtro.visible !== false && filtro.editable !== false && (
        <>
          <h3>Vista previa</h3>
          <div className="widget-preview" style={{ maxWidth: 320 }}>
            <FiltroDashboard filtro={filtro} valor={esFecha ? {} : []}
                             onCambio={() => {}} soloContenido />
          </div>
        </>
      )}
    </div>
  );
}
