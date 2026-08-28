<template>
  <div class="proc-view">
    <!-- Tabs -->
    <div class="proc-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="proc-tab"
        :class="{ activo: tab === t.id }"
        @click="cambiarTab(t.id)"
      >
        <component :is="t.icon" class="proc-tab-icon" />
        {{ t.label }}
        <span v-if="tab === t.id && lista.length" class="proc-tab-count">{{ lista.length }}</span>
      </button>
    </div>

    <div class="proc-body">
      <!-- Panel lateral -->
      <div class="proc-lista">
        <!-- Buscador -->
        <div class="proc-buscar">
          <div class="proc-search-wrap">
            <svg class="proc-search-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/>
            </svg>
            <input
              v-model="filtro"
              class="proc-search-input"
              placeholder="Buscar..."
              @input="cargarLista"
            />
            <button v-if="filtro" class="proc-search-clear" @click="filtro = ''; cargarLista()">✕</button>
          </div>
          <button class="proc-refresh" :disabled="cargandoLista" :class="{ girando: cargandoLista }" @click="cargarLista" title="Recargar">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 10A7 7 0 1 1 10 3M10 3l3 3-3 3"/>
            </svg>
          </button>
        </div>

        <!-- Filtro por esquema -->
        <div v-if="esquemas.length > 1" class="proc-esquemas">
          <button
            v-for="esq in ['', ...esquemas]"
            :key="esq"
            class="esq-chip"
            :class="{ activo: esquemaFiltro === esq }"
            @click="esquemaFiltro = esq"
          >{{ esq || 'Todos' }}</button>
        </div>

        <!-- Empty / error -->
        <div v-if="!listaFiltrada.length && !cargandoLista" class="proc-empty" :class="{ 'proc-empty--warn': sinEmpresa }">
          <template v-if="sinEmpresa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            <span>Seleccione una empresa de gestión en la barra superior.</span>
          </template>
          <template v-else-if="errorLista">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            <span>{{ errorLista }}</span>
          </template>
          <template v-else>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
              <path d="M9 17H5a2 2 0 0 0-2 2v0M13 3H5a2 2 0 0 0-2 2v14M17 8v13m-4-4 4 4 4-4"/>
            </svg>
            <span>Sin resultados.</span>
          </template>
        </div>

        <!-- Lista de items -->
        <div class="proc-items">
          <button
            v-for="item in listaFiltrada"
            :key="`${item.Esquema}.${item.Nombre}`"
            class="proc-item"
            :class="{ activo: seleccionado?.Nombre === item.Nombre && seleccionado?.Esquema === item.Esquema }"
            @click="seleccionar(item)"
          >
            <span class="proc-item-badge" :class="tab === 'sps' ? 'badge-sp' : 'badge-v'">
              {{ tab === 'sps' ? 'SP' : 'V' }}
            </span>
            <span class="proc-item-info">
              <span class="proc-item-nom">{{ item.Nombre }}</span>
              <span class="proc-item-meta">
                <span class="proc-item-esq">{{ item.Esquema }}</span>
                <span v-if="item.Modificado" class="proc-item-fecha">{{ formatFecha(item.Modificado) }}</span>
              </span>
            </span>
          </button>
        </div>
      </div>

      <!-- Panel editor -->
      <div class="proc-editor">
        <!-- Sin selección -->
        <div v-if="!seleccionado" class="proc-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M16 18l2 2 4-4M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7M14 2l6 6M14 2v6h6"/>
            <path d="M10 12a1 1 0 0 0 0 2v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-2z"/>
          </svg>
          <span>Selecciona un elemento para ver y editar su definición</span>
        </div>

        <template v-else>
          <!-- Header -->
          <div class="proc-editor-header">
            <div class="proc-editor-path">
              <span class="proc-editor-badge" :class="tab === 'sps' ? 'badge-sp' : 'badge-v'">
                {{ tab === 'sps' ? 'SP' : 'VISTA' }}
              </span>
              <span class="proc-editor-esq">{{ seleccionado.Esquema }}</span>
              <span class="proc-editor-sep">.</span>
              <span class="proc-editor-nom">{{ seleccionado.Nombre }}</span>
            </div>
            <div class="proc-editor-acciones">
              <span v-if="guardando"  class="proc-status proc-status--saving">Guardando…</span>
              <span v-if="guardadoOk" class="proc-status proc-status--ok">✓ Guardado</span>
              <span v-if="errorGuardar" class="proc-status proc-status--err" :title="errorGuardar">✕ Error</span>

              <!-- Autorización para reportes (solo SPs) -->
              <template v-if="tab === 'sps'">
                <span v-if="esAutorizado" class="proc-auth-badge proc-auth-badge--ok">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8 6.5 12 13 4"/></svg>
                  Autorizado
                </span>
                <button
                  v-else
                  class="btn btn-sm proc-auth-btn"
                  :disabled="autorizando"
                  @click="autorizar"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 1v6M5 4l3-3 3 3"/><rect x="2" y="8" width="12" height="7" rx="1.5"/></svg>
                  {{ autorizando ? 'Autorizando…' : 'Autorizar para reportes' }}
                </button>
              </template>

              <button
                class="btn btn-primary btn-sm"
                :disabled="guardando || cargandoDef"
                @click="guardar"
              >Guardar (ALTER)</button>
            </div>
          </div>

          <!-- Cuerpo del editor -->
          <div v-if="cargandoDef" class="proc-hint">
            <span class="spinner" />
            <span>Cargando definición…</span>
          </div>
          <div v-else-if="errorDef" class="proc-hint proc-hint--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            <span>{{ errorDef }}</span>
          </div>
          <div v-else class="proc-editor-cm">
            <SqlEditor v-model="definicion" min-height="100%" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue';
import { api } from '@/api.js';
import SqlEditor from '@/components/ui/SqlEditor.vue';
import { useToastStore } from '@/stores/toasts.js';

const toast = useToastStore();

// Íconos inline mínimos
const IconSP   = { render: () => h('svg', { viewBox:'0 0 20 20', fill:'none', stroke:'currentColor', 'stroke-width':'1.5' }, [h('path', { d:'M4 5h12M4 9h8M4 13h10M16 12v6m-3-3 3 3 3-3' })]) };
const IconVista = { render: () => h('svg', { viewBox:'0 0 20 20', fill:'none', stroke:'currentColor', 'stroke-width':'1.5' }, [h('path', { d:'M2 10s3.6-6 8-6 8 6 8 6-3.6 6-8 6-8-6-8-6z' }), h('circle', { cx:'10', cy:'10', r:'2.5' })]) };

const tabs = [
  { id: 'sps',    label: 'Stored Procedures', icon: IconSP },
  { id: 'vistas', label: 'Vistas',             icon: IconVista },
];

const tab           = ref('sps');
const filtro        = ref('');
const lista         = ref([]);
const seleccionado  = ref(null);
const definicion    = ref('');
const cargandoLista = ref(false);
const cargandoDef   = ref(false);
const guardando     = ref(false);
const guardadoOk    = ref(false);
const errorLista    = ref('');
const errorDef      = ref('');
const errorGuardar  = ref('');
const sinEmpresa    = ref(false);
const esquemaFiltro = ref('');
const autorizados   = ref(new Set());
const autorizando   = ref(false);

const esAutorizado = computed(() => {
  if (!seleccionado.value) return false;
  const key = `${seleccionado.value.Esquema.toLowerCase()}.${seleccionado.value.Nombre.toLowerCase()}`;
  return autorizados.value.has(key);
});

const esquemas = computed(() => [...new Set(lista.value.map(i => i.Esquema))].sort());
const listaFiltrada = computed(() =>
  esquemaFiltro.value ? lista.value.filter(i => i.Esquema === esquemaFiltro.value) : lista.value
);

onMounted(() => { cargarLista(); cargarAutorizados(); });

function formatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-PY', { day:'2-digit', month:'short', year:'2-digit' });
}

async function cargarLista() {
  cargandoLista.value = true;
  errorLista.value = '';
  sinEmpresa.value = false;
  try {
    lista.value = tab.value === 'sps'
      ? await api.empresaSps(filtro.value)
      : await api.empresaVistas(filtro.value);
  } catch (e) {
    const msg = e.message || 'Error al cargar lista';
    if (msg.toLowerCase().includes('empresa')) {
      sinEmpresa.value = true;
      errorLista.value = msg;
    } else {
      errorLista.value = msg;
    }
    lista.value = [];
  } finally {
    cargandoLista.value = false;
  }
}

function cambiarTab(t) {
  tab.value = t;
  seleccionado.value = null;
  definicion.value = '';
  filtro.value = '';
  errorLista.value = '';
  sinEmpresa.value = false;
  esquemaFiltro.value = '';
  lista.value = [];
  cargarLista();
}

async function seleccionar(item) {
  seleccionado.value = item;
  definicion.value = '';
  errorDef.value = '';
  guardadoOk.value = false;
  errorGuardar.value = '';
  cargandoDef.value = true;
  try {
    const { definition } = await api.empresaDefinicion(item.Esquema, item.Nombre);
    definicion.value = definition || '';
  } catch (e) {
    errorDef.value = e.message || 'No se pudo cargar la definición';
  } finally {
    cargandoDef.value = false;
  }
}

async function cargarAutorizados() {
  try {
    const lista = await api.procedimientos();
    autorizados.value = new Set(
      lista.filter(p => p.Activo).map(p => `${(p.Esquema||'dbo').toLowerCase()}.${p.Nombre.toLowerCase()}`)
    );
  } catch { /* silencioso */ }
}

async function autorizar() {
  if (!seleccionado.value) return;
  autorizando.value = true;
  try {
    await api.autorizarSp({ esquema: seleccionado.value.Esquema, nombre: seleccionado.value.Nombre });
    await cargarAutorizados();
    toast.agregar({ tipo: 'exito', mensaje: `SP ${seleccionado.value.Nombre} autorizado para reportes` });
  } catch (e) {
    toast.agregar({ tipo: 'error', mensaje: e.message || 'Error al autorizar' });
  } finally {
    autorizando.value = false;
  }
}

async function guardar() {
  guardando.value = true;
  guardadoOk.value = false;
  errorGuardar.value = '';
  try {
    await api.empresaAlterar(definicion.value);
    guardadoOk.value = true;
    toast.agregar({ tipo: 'exito', mensaje: 'Definición actualizada correctamente' });
    setTimeout(() => { guardadoOk.value = false; }, 4000);
  } catch (e) {
    errorGuardar.value = e.message || 'Error al guardar';
    toast.agregar({ tipo: 'error', mensaje: errorGuardar.value });
  } finally {
    guardando.value = false;
  }
}
</script>

<style scoped>
/* ── Layout ── */
.proc-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--fondo);
}

/* ── Tabs ── */
.proc-tabs {
  display: flex;
  gap: 0;
  padding: 0 var(--e3);
  border-bottom: 1px solid var(--borde);
  background: var(--superficie);
  flex-shrink: 0;
}

.proc-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 18px;
  border: none;
  background: transparent;
  color: var(--texto-suave);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--transicion), border-color var(--transicion);
}
.proc-tab:hover { color: var(--texto); }
.proc-tab.activo { color: var(--primary); border-bottom-color: var(--primary); }

.proc-tab-icon { width: 15px; height: 15px; flex-shrink: 0; opacity: .7; }
.proc-tab.activo .proc-tab-icon { opacity: 1; }

.proc-tab-count {
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 99px;
  min-width: 18px;
  text-align: center;
}

/* ── Body ── */
.proc-body { display: flex; flex: 1; overflow: hidden; }

/* ── Lista ── */
.proc-lista {
  width: 290px;
  flex-shrink: 0;
  border-right: 1px solid var(--borde);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--superficie);
}

/* Buscador */
.proc-buscar {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--borde);
  flex-shrink: 0;
}

.proc-search-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--fondo);
  border: 1px solid var(--borde);
  border-radius: var(--radio);
  padding: 0 8px;
  transition: border-color var(--transicion);
}
.proc-search-wrap:focus-within { border-color: var(--primary); }

.proc-search-ico { width: 13px; height: 13px; color: var(--texto-tenue); flex-shrink: 0; }

.proc-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: var(--t-sm);
  color: var(--texto);
  padding: 6px 0;
}
.proc-search-input::placeholder { color: var(--texto-tenue); }

.proc-search-clear {
  border: none;
  background: transparent;
  color: var(--texto-tenue);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.proc-search-clear:hover { color: var(--texto); }

.proc-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--borde);
  border-radius: var(--radio);
  background: var(--fondo);
  color: var(--texto-suave);
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--transicion), border-color var(--transicion);
}
.proc-refresh:hover { color: var(--primary); border-color: var(--primary); }
.proc-refresh svg { width: 14px; height: 14px; }
.proc-refresh.girando svg { animation: girar .7s linear infinite; }
@keyframes girar { to { transform: rotate(360deg); } }

/* Esquema chips */
.proc-esquemas {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--borde);
  flex-shrink: 0;
}

.esq-chip {
  padding: 3px 9px;
  border-radius: 99px;
  border: 1px solid var(--borde);
  background: transparent;
  color: var(--texto-suave);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transicion), border-color var(--transicion), color var(--transicion);
}
.esq-chip:hover { border-color: var(--primary); color: var(--primary); }
.esq-chip.activo { background: var(--primary); border-color: var(--primary); color: #fff; }

/* Empty state */
.proc-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: var(--e3);
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  text-align: center;
}
.proc-empty svg { width: 36px; height: 36px; opacity: .35; }
.proc-empty--warn { color: var(--advertencia, #c9860a); }
.proc-empty--warn svg { opacity: .6; }

/* Items */
.proc-items { flex: 1; overflow-y: auto; padding: 4px; }

.proc-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: background var(--transicion);
}
.proc-item:hover { background: var(--fondo-hover); }
.proc-item.activo { background: var(--simple-suave); }

.proc-item-badge {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1.4;
}
.badge-sp { background: #dbeafe; color: #1d4ed8; }
.badge-v  { background: #d1fae5; color: #065f46; }

/* dark mode badges */
@media (prefers-color-scheme: dark) {
  .badge-sp { background: #1e3a5f; color: #93c5fd; }
  .badge-v  { background: #064e3b; color: #6ee7b7; }
}
:root[data-theme="dark"] .badge-sp { background: #1e3a5f; color: #93c5fd; }
:root[data-theme="dark"] .badge-v  { background: #064e3b; color: #6ee7b7; }
:root[data-theme="light"] .badge-sp { background: #dbeafe; color: #1d4ed8; }
:root[data-theme="light"] .badge-v  { background: #d1fae5; color: #065f46; }

.proc-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.proc-item-nom {
  font-size: var(--t-sm);
  font-weight: 500;
  color: var(--texto);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.proc-item.activo .proc-item-nom { color: var(--primary); }

.proc-item-meta {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: var(--texto-tenue);
}

.proc-item-esq { font-family: monospace; }
.proc-item-fecha::before { content: '·'; margin-right: 4px; }

/* ── Editor panel ── */
.proc-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--fondo);
}

.proc-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  padding: var(--e3);
  text-align: center;
}
.proc-hint svg { width: 48px; height: 48px; opacity: .2; }
.proc-hint--err { color: var(--error); }
.proc-hint--err svg { opacity: .5; }

/* Editor header */
.proc-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--borde);
  background: var(--superficie);
  flex-shrink: 0;
  gap: var(--e2);
}

.proc-editor-path {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.proc-editor-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.proc-editor-esq {
  font-size: var(--t-sm);
  color: var(--texto-tenue);
  font-family: monospace;
}
.proc-editor-sep {
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  font-family: monospace;
}
.proc-editor-nom {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--titulo);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proc-editor-acciones {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.proc-status { font-size: var(--t-sm); }
.proc-status--saving { color: var(--texto-tenue); }
.proc-status--ok     { color: var(--primary); }
.proc-status--err    { color: var(--error); cursor: help; }

.proc-editor-cm { flex: 1; overflow: hidden; }

/* Autorización */
.proc-auth-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--t-xs);
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1.5px solid;
}
.proc-auth-badge--ok {
  color: var(--primary);
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.proc-auth-badge svg { width: 12px; height: 12px; }

.proc-auth-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1.5px solid var(--borde-fuerte);
  background: transparent;
  color: var(--texto-suave);
  font-size: var(--t-xs);
}
.proc-auth-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.proc-auth-btn svg { width: 12px; height: 12px; }
</style>
