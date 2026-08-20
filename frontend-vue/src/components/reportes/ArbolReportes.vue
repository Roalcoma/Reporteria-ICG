<template>
  <nav class="arbol">
    <div class="arbol-cab">
      <h3>Reportes</h3>
      <div v-if="puedeEditar" class="arbol-cab-acciones">
        <button class="btn-mini" title="Nuevo reporte" @click="nuevoReporte(null)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button class="btn-mini" title="Nueva carpeta" @click="nuevaCarpeta(null)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
      </div>
    </div>

    <NuevoReporteModal
      v-model="modalAbierto"
      :carpetaId="modalCarpetaId"
      @creado="onCreado"
    />

    <input class="buscador" type="search" v-model="busqueda" placeholder="Buscar reporte…" />
    <p v-if="buscando" class="resultado-busqueda">{{ filtrados.length }} resultado{{ filtrados.length === 1 ? '' : 's' }}</p>


    <div v-if="cargando && !carpetas.length" class="empty"><div class="spinner" /></div>

    <ul v-else>
      <NodoCarpeta
        v-for="c in hijasDe(null)"
        :key="c.CarpetaId"
        :carpeta="c"
        :nivel="0"
      />
      <FilaReporte
        v-for="r in sueltos"
        :key="r.ReporteId"
        :r="r"
        :sangria="4"
      />
    </ul>
    <p v-if="!carpetas.length && !reportes.length && !cargando" class="arbol-vacio">Sin reportes aún.</p>
    <p v-if="buscando && !filtrados.length" class="arbol-vacio">Ningún reporte coincide.</p>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue';
import { api } from '@/api.js';
import { useSessionStore } from '@/stores/session.js';
import { useToast } from '@/composables/useToast.js';
import { useModal } from '@/composables/useModal.js';

// ponytail: recursive components via provide/inject to avoid circular imports
import NodoCarpeta from './ArbolNodo.vue';
import FilaReporte from './ArbolFila.vue';
import NuevoReporteModal from './NuevoReporteModal.vue';

const emit  = defineEmits(['select', 'creado']);
const session = useSessionStore();
const toast   = useToast();
const modal   = useModal();

const carpetas     = ref([]);
const reportes     = ref([]);
const abiertas     = ref({});
const busqueda     = ref('');
const cargando     = ref(false);
const seleccionado = ref(null);
const modalAbierto  = ref(false);
const modalCarpetaId = ref(null);

const puedeEditar = computed(() =>
  session.user?.permisos?.PuedeCrear || session.user?.permisos?.PuedeEditar
);

const buscando  = computed(() => busqueda.value.trim().length > 0);

const TIPO_INFO = {
  SIMPLE:        { etiqueta: 'Simple',     clase: 'badge-simple' },
  MASTER_DETAIL: { etiqueta: 'Multinivel', clase: 'badge-multinivel' },
  DASHBOARD:     { etiqueta: 'Dashboard',  clase: 'badge-dashboard' }
};

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return reportes.value;
  return reportes.value.filter(r =>
    r.Nombre.toLowerCase().includes(q) ||
    (r.Descripcion || '').toLowerCase().includes(q) ||
    (TIPO_INFO[r.Tipo]?.etiqueta || '').toLowerCase().includes(q)
  );
});

const hijasDe   = (padreId) => carpetas.value.filter(c => (c.CarpetaPadreId ?? null) === padreId);
const deCarpeta = (id)      => filtrados.value.filter(r => r.CarpetaId === id);
const sueltos   = computed(() => filtrados.value.filter(r => r.CarpetaId == null));

function tieneCoincidencias(id) {
  if (deCarpeta(id).length) return true;
  return hijasDe(id).some(h => tieneCoincidencias(h.CarpetaId));
}

async function cargar() {
  cargando.value = true;
  try {
    const [c, r] = await Promise.all([api.carpetas(), api.reportes()]);
    carpetas.value = c;
    reportes.value = r;
    const nuevasAbiertas = Object.fromEntries(c.map(x => [x.CarpetaId, true]));
    abiertas.value = { ...nuevasAbiertas, ...abiertas.value };
  } catch (e) {
    toast.error(e.message);
  } finally {
    cargando.value = false;
  }
}

async function accion(fn) {
  try { await fn(); await cargar(); }
  catch (e) { toast.error(e.message); }
}

async function nuevaCarpeta(padreId) {
  const nombre = await modal.prompt(padreId ? 'Nombre de la subcarpeta:' : 'Nombre de la carpeta:', { placeholder: 'Ingrese el nombre' });
  if (nombre) accion(() => api.crearCarpeta({ Nombre: nombre, CarpetaPadreId: padreId }));
}

async function renombrarCarpeta(c) {
  const nombre = await modal.prompt('Renombrar carpeta', { placeholder: 'Nuevo nombre', defaultValue: c.Nombre, label: 'Nombre' });
  if (nombre && nombre !== c.Nombre)
    accion(() => api.actualizarCarpeta(c.CarpetaId, { Nombre: nombre, CarpetaPadreId: c.CarpetaPadreId, Orden: c.Orden }));
}

async function borrarCarpeta(c) {
  const ok = await modal.confirm('Eliminar carpeta', `¿Eliminar la carpeta "${c.Nombre}"?`, { danger: true });
  if (ok) accion(() => api.eliminarCarpeta(c.CarpetaId));
}

function seleccionar(r) {
  seleccionado.value = r?.ReporteId ?? null;
  emit('select', r);
}

async function duplicar(r) {
  const nombre = await modal.prompt('Duplicar reporte', { placeholder: 'Nombre del duplicado', defaultValue: `${r.Nombre} (copia)`, label: 'Nombre' });
  if (nombre)
    accion(async () => {
      const nuevo = await api.duplicarReporte(r.ReporteId, { nombre });
      seleccionar(nuevo);
    });
}

function nuevoReporte(carpetaId) {
  modalCarpetaId.value = carpetaId ?? null;
  modalAbierto.value = true;
}

function onCreado(r) {
  cargar().then(() => {
    seleccionar(r);
    emit('creado', r);
  });
}

async function borrarReporte(r) {
  const ok = await modal.confirm('Eliminar reporte', `¿Eliminar "${r.Nombre}"? Se conserva el historial para auditoría.`, { danger: true });
  if (ok) accion(async () => {
    await api.eliminarReporte(r.ReporteId);
    if (seleccionado.value === r.ReporteId) seleccionar(null);
  });
}

// Provide context to child components
provide('arbol', {
  abiertas, buscando, hijasDe, deCarpeta, tieneCoincidencias,
  puedeEditar, seleccionado,
  seleccionar, duplicar, borrarReporte, nuevaCarpeta, renombrarCarpeta, borrarCarpeta,
  nuevoReporte,
  TIPO_INFO
});

onMounted(cargar);
</script>

<style scoped>
.arbol {
  padding: var(--e2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 100%;
}
.arbol-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--e2) var(--e2) var(--e3);
}
.arbol-cab h3 {
  font-size: var(--t-base);
  font-weight: 700;
  color: var(--titulo);
  text-transform: uppercase;
  letter-spacing: .06em;
}
.arbol-cab-acciones {
  display: flex;
  gap: 4px;
}
.btn-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px; height: 24px;
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r1);
  background: transparent;
  color: var(--texto-suave);
  cursor: pointer;
  transition: background var(--transicion), color var(--transicion);
}
.btn-mini:hover { background: var(--muted); color: var(--texto); }

.buscador {
  width: 100%;
  padding: 6px var(--e3);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: var(--panel-alt);
  font-size: var(--t-sm);
  color: var(--texto);
  margin-bottom: var(--e2);
}
.buscador:focus { outline: none; border-color: var(--primary); }

.resultado-busqueda { font-size: var(--t-xs); color: var(--texto-tenue); padding: 0 var(--e2) var(--e1); }
.arbol-vacio { color: var(--texto-tenue); font-size: var(--t-sm); padding: var(--e3); text-align: center; }

ul { list-style: none; }
</style>
