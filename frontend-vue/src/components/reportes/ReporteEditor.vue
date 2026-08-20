<template>
  <div class="editor">

    <!-- Cabecera fija -->
    <header class="editor-head">
      <div class="editor-head-info">
        <h2 class="editor-titulo">{{ form.reporte.Nombre || 'Sin título' }}</h2>
        <div class="editor-badges">
          <span class="badge" :class="tipoBadge">{{ form.reporte.Tipo }}</span>
          <span class="badge badge-area">{{ form.reporte.Area }}</span>
        </div>
      </div>
      <div class="editor-head-acc">
        <button class="btn btn-ghost" @click="$emit('cerrar')" :disabled="guardando">Cancelar</button>
        <button class="btn btn-primary" @click="guardar" :disabled="guardando || !form.reporte.Nombre?.trim()">
          <span v-if="guardando" class="spinner" />
          Guardar
        </button>
      </div>
    </header>

    <!-- Barra de pestañas -->
    <nav class="editor-tabs">
      <button
        v-for="t in TABS" :key="t.id"
        class="editor-tab" :class="{ activo: tabActiva === t.id }"
        @click="tabActiva = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'sql'  && form.parametros.length" class="tab-cnt">{{ form.parametros.length }}</span>
        <span v-if="t.id === 'cols' && form.columnas.length"   class="tab-cnt">{{ form.columnas.length }}</span>
      </button>
    </nav>

    <div v-if="cargando" class="empty"><div class="spinner" /></div>

    <div v-else class="editor-body">

      <!-- ══════════════ INFO ══════════════ -->
      <section v-if="tabActiva === 'info'" class="ed-section">
        <div class="campos-grilla">
          <div class="campo span-2">
            <label>Nombre <span class="req">*</span></label>
            <input v-model="form.reporte.Nombre" type="text" placeholder="Ej: Ventas por cliente" />
          </div>
          <div class="campo span-2">
            <label>Descripción</label>
            <textarea v-model="form.reporte.Descripcion" rows="2" placeholder="Descripción opcional" />
          </div>
          <div class="campo">
            <label>Tipo</label>
            <select v-model="form.reporte.Tipo" @change="onTipoChange">
              <option value="SIMPLE">Simple</option>
              <option value="MASTER_DETAIL">Multinivel (cabecera + detalle)</option>
            </select>
          </div>
          <div class="campo">
            <label>Área</label>
            <select v-model="form.reporte.Area">
              <option value="GESTION">Gestión</option>
              <option value="CONTABLE">Contable</option>
            </select>
          </div>
          <div class="campo">
            <label>Orientación PDF</label>
            <select v-model="form.reporte.OrientacionPdf">
              <option value="VERTICAL">Vertical</option>
              <option value="HORIZONTAL">Horizontal</option>
            </select>
          </div>
          <div class="campo">
            <label>Tamaño hoja</label>
            <select v-model="form.reporte.TamanoHoja">
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="LETTER">Carta</option>
              <option value="LEGAL">Oficio</option>
              <option value="TABLOID">Tabloide</option>
            </select>
          </div>
        </div>
      </section>

      <!-- ══════════════ CONSULTA Y PARÁMETROS ══════════════ -->
      <section v-else-if="tabActiva === 'sql'" class="ed-section ed-section--sql">

        <!-- SIMPLE -->
        <template v-if="form.reporte.Tipo === 'SIMPLE'">
          <div class="sql-bloque">
            <div class="sql-bloque-head">
              <span class="sql-rol sql-rol--flat">Consulta principal</span>
              <button class="btn btn-ghost btn-sm" @click="descubrir('FLAT')" :disabled="descubriendo">
                <span v-if="descubriendo" class="spinner" />
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                Descubrir columnas
              </button>
            </div>
            <textarea class="sql-area" v-model="consultaFlat.SqlText"
              placeholder="SELECT columna1, columna2&#10;FROM tabla&#10;WHERE condicion = {PARAMETRO}" spellcheck="false" />
          </div>
        </template>

        <!-- MASTER_DETAIL -->
        <template v-else>
          <div class="sql-bloque">
            <div class="sql-bloque-head">
              <span class="sql-rol sql-rol--cab">Cabecera</span>
              <button class="btn btn-ghost btn-sm" @click="descubrir('CABECERA')" :disabled="descubriendo">
                <span v-if="descubriendo" class="spinner" />
                Descubrir columnas cabecera
              </button>
            </div>
            <textarea class="sql-area" v-model="consultaCabecera.SqlText"
              placeholder="SELECT ... FROM ..." spellcheck="false" />
          </div>

          <div class="vinculo-fila">
            <div class="campo">
              <label>Campo vínculo en Cabecera</label>
              <input v-model="consultaDetalle.CampoVinculoCabecera" placeholder="Ej: IdDocumento" />
            </div>
            <div class="vinculo-icono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            </div>
            <div class="campo">
              <label>Campo vínculo en Detalle</label>
              <input v-model="consultaDetalle.CampoVinculoDetalle" placeholder="Ej: IdDocumento" />
            </div>
          </div>

          <div class="sql-bloque">
            <div class="sql-bloque-head">
              <span class="sql-rol sql-rol--det">Detalle</span>
              <button class="btn btn-ghost btn-sm" @click="descubrir('DETALLE')" :disabled="descubriendo">
                <span v-if="descubriendo" class="spinner" />
                Descubrir columnas detalle
              </button>
            </div>
            <textarea class="sql-area" v-model="consultaDetalle.SqlText"
              placeholder="SELECT ... FROM ..." spellcheck="false" />
          </div>
        </template>

        <!-- ── Parámetros inline ── -->
        <div class="sql-params-sep">
          <span class="sql-params-titulo">
            Parámetros
            <span v-if="form.parametros.length" class="tab-cnt">{{ form.parametros.length }}</span>
          </span>
          <button class="btn btn-ghost btn-sm" @click="agregarParam()">+ Agregar parámetro</button>
        </div>

        <div v-if="!form.parametros.length" class="editor-vacio">
          Sin parámetros — el reporte se ejecuta sin filtros.<br>
          <small>Usá <code>{NOMBRE}</code> en el SQL y se agregan solos.</small>
        </div>

        <div class="param-lista">
          <div v-for="(p, i) in form.parametros" :key="i" class="param-card">
            <div class="param-card-head">
              <span class="param-num">{{ i + 1 }}</span>
              <div class="param-ids">
                <div class="campo">
                  <label>Nombre en SQL (sin llaves)</label>
                  <input v-model="p.Nombre" placeholder="FECHA_DESDE"
                    @blur="p.Nombre = p.Nombre.toUpperCase().replace(/\s/g, '_')" />
                </div>
                <div class="campo flex1">
                  <label>Etiqueta para el usuario</label>
                  <input v-model="p.Etiqueta" placeholder="Fecha desde" />
                </div>
              </div>
              <button class="btn-mini-danger" @click="form.parametros.splice(i, 1)" title="Eliminar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="param-fila">
              <div class="campo">
                <label>Tipo de dato</label>
                <select v-model="p.TipoDato" @change="onTipoDatoChange(p)">
                  <option value="STRING">Texto</option>
                  <option value="INT">Entero</option>
                  <option value="DECIMAL">Decimal</option>
                  <option value="DATE">Fecha</option>
                  <option value="DATETIME">Fecha y hora</option>
                  <option value="BOOL">Booleano</option>
                </select>
              </div>
              <div class="campo">
                <label>Control de entrada</label>
                <select v-model="p.ControlUI">
                  <option value="TEXTO">Texto libre</option>
                  <option value="FECHA">Selector de fecha</option>
                  <option value="BOOL">Checkbox</option>
                  <option value="LISTA_ESTATICA">Lista estática</option>
                  <option value="LISTA_SQL">Lista dinámica (SQL)</option>
                </select>
              </div>
              <div class="campo campo-chico">
                <label>Obligatorio</label>
                <label class="toggle-label">
                  <input type="checkbox" v-model="p.Obligatorio" />
                  <span class="toggle-track" />
                </label>
              </div>
              <div class="campo campo-chico">
                <label>Múltiple</label>
                <label class="toggle-label">
                  <input type="checkbox" v-model="p.PermiteMultiple" />
                  <span class="toggle-track" />
                </label>
              </div>
            </div>

            <div class="campo" v-if="p.TipoDato !== 'BOOL'">
              <label>Valor por defecto</label>
              <input v-model="p.ValorDefault" :type="(p.TipoDato === 'DATE' || p.TipoDato === 'DATETIME') ? 'date' : 'text'" placeholder="Opcional" />
            </div>

            <!-- Lista SQL -->
            <template v-if="p.ControlUI === 'LISTA_SQL'">
              <div class="campo">
                <label>SQL para poblar la lista</label>
                <textarea v-model="p.SqlOrigen" rows="2" spellcheck="false" class="sql-area-sm"
                  placeholder="SELECT id, descripcion FROM tabla ORDER BY descripcion" />
              </div>
              <div class="param-fila">
                <div class="campo">
                  <label>Campo valor</label>
                  <input v-model="p.CampoValor" placeholder="id" />
                </div>
                <div class="campo">
                  <label>Campo texto</label>
                  <input v-model="p.CampoTexto" placeholder="descripcion" />
                </div>
              </div>

              <!-- Asistente de tabla ICG -->
              <details class="ticg-asistente">
                <summary>📋 Usar tabla ICG</summary>
                <TablaICGSelector @aplicar="(cfg) => { p.SqlOrigen = cfg.sqlOrigen; p.CampoValor = cfg.campoValor; p.CampoTexto = cfg.campoTexto; }" />
              </details>
            </template>

            <!-- Lista estática -->
            <template v-if="p.ControlUI === 'LISTA_ESTATICA'">
              <div class="ops-lista">
                <label class="ops-titulo">Opciones</label>
                <div v-for="(o, oi) in p.opciones" :key="oi" class="op-fila">
                  <input v-model="o.Valor" class="op-input" placeholder="Valor" />
                  <input v-model="o.Texto" class="op-input" placeholder="Texto visible" />
                  <button class="btn-ico-danger" @click="p.opciones.splice(oi, 1)">×</button>
                </div>
                <button class="btn btn-ghost btn-xs"
                  @click="p.opciones.push({ Valor: '', Texto: '', Orden: p.opciones.length })">
                  + Opción
                </button>
              </div>
            </template>
          </div>
        </div>

      </section>

      <!-- ══════════════ COLUMNAS ══════════════ -->
      <section v-else-if="tabActiva === 'cols'" class="ed-section">
        <div class="sec-head">
          <p class="sec-hint">Define cómo se presenta cada columna del resultado. Usa "Descubrir" para generarlas desde el SQL.</p>
          <div class="sec-head-acc">
            <button class="btn btn-ghost btn-sm" @click="descubrirPrincipal" :disabled="descubriendo">
              <span v-if="descubriendo" class="spinner" />
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              Descubrir desde SQL
            </button>
            <button class="btn btn-ghost btn-sm" @click="agregarColumna">+ Agregar</button>
          </div>
        </div>

        <div v-if="!form.columnas.length" class="editor-vacio">
          Sin columnas. Escribe el SQL en "Consulta y parámetros" y presiona "Descubrir desde SQL".
        </div>

        <div v-else class="col-tabla-wrap">
          <table class="col-tabla">
            <thead>
              <tr>
                <th>Campo SQL</th>
                <th>Alias visible</th>
                <th>Formato</th>
                <th>Pie</th>
                <th>Visible</th>
                <th>Agrupable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, i) in form.columnas" :key="i">
                <td><input v-model="c.NombreCampo" class="cinput" placeholder="nombre_campo" /></td>
                <td><input v-model="c.AliasVisible" class="cinput" placeholder="Nombre visible" /></td>
                <td class="td-formato">
                  <select v-model="c.Formato" class="cselect">
                    <option value="TEXTO">Texto</option>
                    <option value="ENTERO">Entero</option>
                    <option value="NUMERO">Número</option>
                    <option value="MONEDA">Moneda</option>
                    <option value="FECHA">Fecha</option>
                    <option value="BOOL">Bool</option>
                    <option value="PORCENTAJE">%</option>
                  </select>
                  <input v-if="c.Formato === 'FECHA'" v-model="c.FormatoPatron"
                    class="cinput cinput-patron" placeholder="dd/MM/yyyy"
                    title="Patrón: dd día · MM mes · yyyy año · HH hora · mm minutos" />
                </td>
                <td>
                  <select v-model="c.AgregacionPie" class="cselect cselect-sm">
                    <option value="NINGUNA">—</option>
                    <option value="SUMA">Suma</option>
                    <option value="PROMEDIO">Prom.</option>
                    <option value="MIN">Mín.</option>
                    <option value="MAX">Máx.</option>
                    <option value="CONTAR">Contar</option>
                  </select>
                </td>
                <td class="tc"><input type="checkbox" v-model="c.VisiblePorDefecto" /></td>
                <td class="tc"><input type="checkbox" v-model="c.EsAgrupable" /></td>
                <td class="col-ops">
                  <button class="btn-ico" @click="mover(i,-1)" :disabled="i===0">↑</button>
                  <button class="btn-ico" @click="mover(i,1)"  :disabled="i===form.columnas.length-1">↓</button>
                  <button class="btn-ico btn-ico-danger" @click="form.columnas.splice(i,1)">×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div><!-- /editor-body -->
  </div><!-- /editor -->
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { api } from '@/api.js';
import { useToast } from '@/composables/useToast.js';
import { useSessionStore } from '@/stores/session.js';
import TablaICGSelector from './TablaICGSelector.vue';

const props = defineProps({ reporte: { type: Object, required: true } });
const emit  = defineEmits(['guardado', 'cerrar']);
const toast   = useToast();
const session = useSessionStore();

const TABS = [
  { id: 'info', label: 'Info general' },
  { id: 'sql',  label: 'Consulta y parámetros' },
  { id: 'cols', label: 'Columnas' },
];

const cargando    = ref(false);
const guardando   = ref(false);
const descubriendo = ref(false);
const tabActiva   = ref('info');

const form = reactive({
  reporte:    { Nombre:'', Descripcion:'', Tipo:'SIMPLE', Area:'GESTION', OrientacionPdf:'VERTICAL', TamanoHoja:'A4', CarpetaId:null },
  consultas:  [],
  parametros: [],
  columnas:   [],
});

const tipoBadge = computed(() => ({
  'badge-simple':     form.reporte.Tipo === 'SIMPLE',
  'badge-multinivel': form.reporte.Tipo === 'MASTER_DETAIL',
}));

// Accessors helpers — crean la entrada si no existe
function consultaPor(rol) {
  let c = form.consultas.find(x => x.Rol === rol);
  if (!c) {
    c = { Rol: rol, SqlText: '', CampoVinculoCabecera: '', CampoVinculoDetalle: '', Orden: form.consultas.length };
    form.consultas.push(c);
  }
  return c;
}
const consultaFlat     = computed(() => consultaPor('FLAT'));
const consultaCabecera = computed(() => consultaPor('CABECERA'));
const consultaDetalle  = computed(() => consultaPor('DETALLE'));

const paramsEnSql = computed(() => {
  const found = new Set();
  for (const c of form.consultas)
    for (const m of (c.SqlText || '').matchAll(/\{([A-Z0-9_]+)\}/g))
      found.add(m[1].toUpperCase());
  return [...found];
});

// Sincroniza parámetros con los tokens {NOMBRE} del SQL.
// Debounce 700ms para no reaccionar a nombres incompletos mientras se tipea.
let _syncTimer = null;
watch(paramsEnSql, (nombres) => {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    // Elimina los auto-creados que ya no aparecen en el SQL
    form.parametros = form.parametros.filter(p => !p._auto || nombres.includes(p.Nombre));
    // Agrega los que faltan
    for (const n of nombres)
      if (!form.parametros.find(p => p.Nombre === n)) agregarParam(n);
  }, 700);
});

// Carga la definición completa
async function cargar() {
  cargando.value = true;
  tabActiva.value = 'info';
  try {
    const def = await api.reporte(props.reporte.ReporteId);
    Object.assign(form.reporte, def.reporte);
    form.consultas  = (def.consultas  || []).map(c => ({ ...c }));
    form.parametros = (def.parametros || []).map(p => ({ ...p, opciones: (p.opciones || []).map(o => ({ ...o })) }));
    form.columnas   = (def.columnas   || []).map(c => ({ ...c }));
    // Garantiza al menos una consulta
    if (!form.consultas.length) {
      form.consultas.push({ Rol: form.reporte.Tipo === 'SIMPLE' ? 'FLAT' : 'CABECERA', SqlText: '', Orden: 0 });
    }
  } catch (e) {
    toast.error(e.message);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
watch(() => props.reporte.ReporteId, cargar);

// Cuando cambia el Tipo, reordena las consultas
function onTipoChange() {
  if (form.reporte.Tipo === 'SIMPLE') {
    const cab = form.consultas.find(c => c.Rol === 'CABECERA');
    if (cab) cab.Rol = 'FLAT';
    form.consultas = form.consultas.filter(c => c.Rol === 'FLAT').slice(0, 1);
    if (!form.consultas.length) form.consultas.push({ Rol: 'FLAT', SqlText: '', Orden: 0 });
  } else {
    const flat = form.consultas.find(c => c.Rol === 'FLAT');
    if (flat) flat.Rol = 'CABECERA';
    if (!form.consultas.find(c => c.Rol === 'CABECERA'))
      form.consultas.push({ Rol: 'CABECERA', SqlText: '', Orden: 0 });
    if (!form.consultas.find(c => c.Rol === 'DETALLE'))
      form.consultas.push({ Rol: 'DETALLE', SqlText: '', CampoVinculoCabecera: '', CampoVinculoDetalle: '', Orden: 1 });
    form.consultas = form.consultas.filter(c => c.Rol === 'CABECERA' || c.Rol === 'DETALLE');
  }
  form.columnas = []; // columnas ya no aplican tras cambio de tipo
}

function onTipoDatoChange(p) {
  if (p.TipoDato === 'DATE' || p.TipoDato === 'DATETIME') p.ControlUI = 'FECHA';
  else if (p.TipoDato === 'BOOL') p.ControlUI = 'BOOL';
  else if (!['TEXTO','LISTA_ESTATICA','LISTA_SQL'].includes(p.ControlUI)) p.ControlUI = 'TEXTO';
}

function agregarParam(nombre = '') {
  form.parametros.push({
    Nombre: nombre ? nombre.toUpperCase() : '',
    Etiqueta: nombre || '',
    TipoDato: 'STRING', Clase: 'VALOR',
    ControlUI: 'TEXTO', Obligatorio: !!nombre, PermiteMultiple: false,
    ValorDefault: null, Precision: null, Escala: null,
    SqlOrigen: null, CampoValor: null, CampoTexto: null,
    Orden: form.parametros.length, opciones: [],
    _auto: !!nombre, // marcador interno: true = creado automáticamente desde el SQL
  });
}

function agregarColumna() {
  form.columnas.push({
    ConsultaRol: form.reporte.Tipo === 'SIMPLE' ? 'FLAT' : 'CABECERA',
    NombreCampo: '', AliasVisible: '', Formato: 'TEXTO',
    VisiblePorDefecto: true, EsAdicional: false, EsAgrupable: false,
    AgregacionPie: 'NINGUNA', Orden: form.columnas.length,
  });
}

function mover(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= form.columnas.length) return;
  [form.columnas[i], form.columnas[j]] = [form.columnas[j], form.columnas[i]];
  form.columnas.forEach((c, k) => { c.Orden = k; });
}

async function descubrir(rol) {
  const consulta = form.consultas.find(c => c.Rol === rol);
  if (!consulta?.SqlText?.trim()) {
    toast.aviso('Escribe el SQL antes de descubrir columnas');
    tabActiva.value = 'sql';
    return;
  }
  descubriendo.value = true;
  try {
    const out = await api.descubrirColumnas({
      sqlText: consulta.SqlText,
      area: form.reporte.Area,
      definiciones: form.parametros,
      codEmpresa: session.empresaGestion?.codEmpresa,
      parametros: {}
    });
    // Fusiona: respeta las personalizaciones previas del mismo campo
    const prevMap = new Map(form.columnas.filter(c => c.ConsultaRol === rol).map(c => [c.NombreCampo, c]));
    const nuevas = out.columnas.map((c, i) => {
      const prev = prevMap.get(c.NombreCampo);
      return prev
        ? { ...prev, Orden: i }
        : { ...c, ConsultaRol: rol, Orden: i };
    });
    form.columnas = [
      ...form.columnas.filter(c => c.ConsultaRol !== rol),
      ...nuevas,
    ].sort((a, b) => a.Orden - b.Orden);
    toast.ok(`${out.columnas.length} columna${out.columnas.length === 1 ? '' : 's'} descubiertas`);
    tabActiva.value = 'cols';
  } catch (e) {
    toast.error(e.message);
  } finally {
    descubriendo.value = false;
  }
}

function descubrirPrincipal() {
  descubrir(form.reporte.Tipo === 'SIMPLE' ? 'FLAT' : 'CABECERA');
}

async function guardar() {
  if (!form.reporte.Nombre?.trim()) { toast.aviso('El nombre es obligatorio'); return; }
  guardando.value = true;
  try {
    const def = {
      reporte:    { ...form.reporte },
      consultas:  form.consultas.filter(c => c.SqlText?.trim()).map((c, i) => ({ ...c, Orden: i })),
      parametros: form.parametros.map((p, i) => { const { _auto, ...rest } = p; return { ...rest, Orden: i }; }),
      columnas:   form.columnas.map((c, i) => ({ ...c, Orden: i })),
    };
    await api.actualizarReporte(props.reporte.ReporteId, def);
    toast.ok('Reporte guardado correctamente');
    emit('guardado', { ...props.reporte, Nombre: form.reporte.Nombre, Tipo: form.reporte.Tipo });
  } catch (e) {
    toast.error(e.message);
  } finally {
    guardando.value = false;
  }
}
</script>

<style scoped>
/* ── Layout ── */
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Cabecera ── */
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--e4);
  padding: var(--e4) var(--e5);
  border-bottom: 1px solid var(--borde-fuerte);
  background: var(--panel);
  flex-shrink: 0;
}
.editor-head-info { display: flex; align-items: center; gap: var(--e3); min-width: 0; }
.editor-titulo {
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--titulo);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editor-badges { display: flex; gap: var(--e2); flex-shrink: 0; }
.badge-area { background: #F0FDF4; color: #166534; }
.badge-simple { background: var(--simple-suave); color: var(--simple); }
.badge-multinivel { background: var(--multinivel-suave); color: var(--multinivel); }

.editor-head-acc { display: flex; gap: var(--e2); flex-shrink: 0; }

/* ── Tabs ── */
.editor-tabs {
  display: flex;
  gap: 2px;
  padding: 0 var(--e5);
  border-bottom: 2px solid var(--borde);
  background: var(--panel);
  flex-shrink: 0;
}
.editor-tab {
  padding: 10px var(--e4);
  border: none;
  background: transparent;
  color: var(--texto-suave);
  font-size: var(--t-base);
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color var(--transicion), border-color var(--transicion);
  white-space: nowrap;
}
.editor-tab:hover { color: var(--texto); }
.editor-tab.activo { color: var(--primary); border-bottom-color: var(--primary); }

.tab-cnt {
  font-size: var(--t-xs);
  font-weight: 700;
  background: var(--primary);
  color: #fff;
  border-radius: 10px;
  padding: 1px 6px;
  line-height: 1.4;
}

/* ── Body ── */
.editor-body {
  flex: 1;
  overflow-y: auto;
}
.ed-section {
  padding: var(--e5);
  display: flex;
  flex-direction: column;
  gap: var(--e4);
  max-width: 900px;
}
.ed-section--sql { max-width: 100%; }

/* ── Grid info ── */
.campos-grilla {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--e3);
}
.span-2 { grid-column: span 2; }

/* ── SQL ── */
.sql-bloque {
  display: flex;
  flex-direction: column;
  gap: var(--e2);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r3);
  overflow: hidden;
}
.sql-bloque-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px var(--e4);
  background: var(--panel);
  border-bottom: 1px solid var(--borde);
}
.sql-rol {
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  padding: 2px 8px;
  border-radius: 4px;
}
.sql-rol--flat { background: var(--simple-suave); color: var(--simple); }
.sql-rol--cab  { background: var(--dashboard-suave); color: var(--dashboard); }
.sql-rol--det  { background: var(--multinivel-suave); color: var(--multinivel); }

.sql-area {
  width: 100%;
  min-height: 200px;
  padding: var(--e3) var(--e4);
  border: none;
  background: var(--fondo);
  color: var(--texto);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}
.sql-area:focus { background: var(--panel-alt); }

.sql-area-sm {
  width: 100%;
  min-height: 64px;
  padding: 8px 12px;
  border: 1.5px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: var(--panel-alt);
  color: var(--texto);
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.vinculo-fila {
  display: flex;
  align-items: flex-end;
  gap: var(--e3);
}
.vinculo-icono {
  color: var(--texto-tenue);
  padding-bottom: 10px;
  flex-shrink: 0;
}

/* ── Sección head ── */
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--e3);
}
.sec-head-acc { display: flex; gap: var(--e2); }
.sec-hint {
  font-size: var(--t-sm);
  color: var(--texto-tenue);
}
.sec-hint code {
  font-family: monospace;
  background: var(--muted);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--primary);
}

/* ── Parámetros ── */
.param-lista { display: flex; flex-direction: column; gap: var(--e3); }
.param-card {
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r3);
  padding: var(--e4);
  display: flex;
  flex-direction: column;
  gap: var(--e3);
  background: var(--panel);
}
.param-card-head {
  display: flex;
  align-items: flex-start;
  gap: var(--e3);
}
.param-num {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: var(--t-xs);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 24px;
}
.param-ids { display: flex; flex: 1; gap: var(--e3); }
.param-fila { display: flex; gap: var(--e3); flex-wrap: wrap; }
.flex1 { flex: 1; }

/* ── Opciones lista estática ── */
.ops-lista { display: flex; flex-direction: column; gap: var(--e2); }
.ops-titulo { font-size: var(--t-sm); font-weight: 600; color: var(--texto-suave); margin-bottom: 4px; }
.op-fila { display: flex; gap: var(--e2); align-items: center; }
.op-input { flex: 1; }
.btn-ico-danger {
  width: 22px; height: 22px;
  border: none; background: transparent;
  color: var(--error);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  border-radius: var(--r1);
  display: flex; align-items: center; justify-content: center;
  transition: background var(--transicion);
}
.btn-ico-danger:hover { background: var(--error-suave); }
.btn-xs {
  font-size: var(--t-xs);
  padding: 3px 8px;
  border-radius: var(--r1);
}

/* ── Columnas tabla ── */
.col-tabla-wrap { overflow-x: auto; }
.col-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-sm);
}
.col-tabla th {
  text-align: left;
  padding: 8px var(--e3);
  background: var(--panel);
  border-bottom: 2px solid var(--borde-fuerte);
  color: var(--texto-suave);
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  white-space: nowrap;
}
.col-tabla td {
  padding: 5px var(--e2);
  border-bottom: 1px solid var(--borde);
  vertical-align: middle;
}
.cinput {
  width: 100%;
  min-width: 100px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: var(--r1);
  background: transparent;
  color: var(--texto);
  font-size: var(--t-sm);
  font-family: var(--fuente);
}
.cinput:focus { outline: none; border-color: var(--primary); background: var(--panel-alt); }

.cselect {
  padding: 5px 6px;
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r1);
  background: var(--panel-alt);
  color: var(--texto);
  font-size: var(--t-sm);
  font-family: var(--fuente);
}
.cselect-sm { max-width: 90px; }
.td-formato { display: flex; flex-direction: column; gap: 3px; }
.cinput-patron { font-family: monospace; font-size: var(--t-xs); }

.tc { text-align: center; }
.col-ops { display: flex; gap: 2px; align-items: center; }

.btn-ico {
  width: 22px; height: 22px;
  border: none; background: transparent;
  color: var(--texto-tenue);
  cursor: pointer;
  border-radius: var(--r1);
  font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--transicion), color var(--transicion);
}
.btn-ico:hover:not(:disabled) { background: var(--muted); color: var(--texto); }
.btn-ico:disabled { opacity: .35; cursor: default; }
.btn-ico.btn-ico-danger:hover:not(:disabled) { background: var(--error-suave); color: var(--error); }

/* ── Toggle switch ── */
.toggle-label { display: flex; align-items: center; cursor: pointer; }
.toggle-label input { display: none; }
.toggle-track {
  width: 36px; height: 20px;
  border-radius: 10px;
  background: var(--borde-fuerte);
  position: relative;
  transition: background var(--transicion);
}
.toggle-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--transicion);
}
.toggle-label input:checked + .toggle-track { background: var(--primary); }
.toggle-label input:checked + .toggle-track::after { transform: translateX(16px); }

/* ── Misc ── */
.campo-chico { flex-shrink: 0; }
.editor-vacio {
  padding: var(--e5);
  text-align: center;
  color: var(--texto-tenue);
  font-size: var(--t-base);
  border: 1.5px dashed var(--borde-fuerte);
  border-radius: var(--r3);
  line-height: 1.7;
}
.editor-vacio code {
  font-family: monospace;
  background: var(--muted);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--primary);
}
.btn-mini-danger {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: 1px solid var(--error);
  border-radius: var(--r1);
  background: transparent;
  color: var(--error);
  cursor: pointer;
  transition: background var(--transicion);
}
.btn-mini-danger:hover { background: var(--error-suave); }
.btn-sm {
  font-size: var(--t-sm);
  padding: 5px var(--e3);
}
.req { color: var(--error); }

/* ── Separador SQL → Parámetros ── */
.sql-params-sep {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--e3) 0 var(--e2);
  border-top: 1px solid var(--borde-fuerte);
  margin-top: var(--e2);
}
.sql-params-titulo {
  display: flex;
  align-items: center;
  gap: var(--e2);
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--texto-suave);
  text-transform: uppercase;
  letter-spacing: .06em;
}
.ticg-asistente {
  border: 1px dashed var(--borde);
  border-radius: 8px;
  padding: 8px 12px;
}
.ticg-asistente summary {
  cursor: pointer;
  font-size: var(--t-sm);
  color: var(--texto-suave);
  user-select: none;
}
.ticg-asistente[open] summary { margin-bottom: var(--e2); }
</style>
