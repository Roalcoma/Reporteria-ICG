<template>
  <div class="ticg">
    <!-- Tablas comunes -->
    <div class="ticg-chips">
      <button
        v-for="t in catalogo"
        :key="t.tabla"
        class="chip"
        :class="{ activo: tablaSeleccionada === t.tabla }"
        type="button"
        @click="elegirTabla(t.tabla)"
      >{{ t.label }}</button>
    </div>

    <!-- Búsqueda libre -->
    <div class="ticg-libre">
      <input
        v-model="tablaLibre"
        class="cinput"
        placeholder="Otra tabla (ej: FAMILIAS)"
        @keydown.enter.prevent="elegirTabla(tablaLibre)"
      />
      <button class="btn btn-ghost btn-sm" type="button" :disabled="!tablaLibre.trim() || cargando"
        @click="elegirTabla(tablaLibre)">
        <span v-if="cargando" class="spinner" />
        <span v-else>Buscar</span>
      </button>
    </div>

    <!-- Columnas de la tabla seleccionada -->
    <template v-if="columnas.length">
      <div class="ticg-cols">
        <div class="ticg-sel">
          <label>Campo valor</label>
          <select v-model="campoValor" class="cinput">
            <option value="">(seleccione)</option>
            <option v-for="c in columnas" :key="c.col" :value="c.col">{{ c.col }} — {{ c.label || c.tipo }}</option>
          </select>
        </div>
        <div class="ticg-sel">
          <label>Campo texto</label>
          <select v-model="campoTexto" class="cinput">
            <option value="">(igual que valor)</option>
            <option v-for="c in columnas" :key="c.col" :value="c.col">{{ c.col }} — {{ c.label || c.tipo }}</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary btn-sm" type="button" :disabled="!campoValor"
        @click="aplicar">
        ✓ Aplicar
      </button>
    </template>

    <p v-if="error" class="ticg-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '@/api.js';
import { useSessionStore } from '@/stores/session.js';

const props = defineProps({
  tabla: { type: String, default: '' }
});
const emit = defineEmits(['aplicar']);

const session = useSessionStore();
const catalogo   = ref([]);
const columnas   = ref([]);
const tablaSeleccionada = ref('');
const tablaLibre = ref('');
const campoValor = ref('');
const campoTexto = ref('');
const cargando   = ref(false);
const error      = ref('');

onMounted(async () => {
  try { catalogo.value = await api.tablasIcgCatalogo(); } catch { /* sin catálogo */ }
});

async function elegirTabla(nombre) {
  const t = (nombre || '').trim().toUpperCase();
  if (!t) return;
  tablaSeleccionada.value = t;
  tablaLibre.value = '';
  campoValor.value = '';
  campoTexto.value = '';
  error.value = '';

  // primero busca en el catálogo estático
  const entrada = catalogo.value.find(c => c.tabla === t);
  if (entrada) {
    columnas.value = entrada.columnas;
    return;
  }

  // si no, consulta INFORMATION_SCHEMA
  cargando.value = true;
  try {
    const cols = await api.tablasIcgColumnas(t, session.empresaGestion?.codEmpresa);
    if (!cols.length) { error.value = `La tabla ${t} no existe o no tiene columnas.`; columnas.value = []; }
    else columnas.value = cols;
  } catch (e) {
    error.value = e.message || 'Error al consultar columnas';
    columnas.value = [];
  } finally {
    cargando.value = false;
  }
}

function aplicar() {
  const cv = campoValor.value;
  const ct = campoTexto.value || cv;
  const t  = tablaSeleccionada.value;
  const sql = cv === ct
    ? `SELECT DISTINCT ${cv} FROM ${t} ORDER BY ${cv}`
    : `SELECT ${cv}, ${ct} FROM ${t} ORDER BY ${ct}`;
  emit('aplicar', { sqlOrigen: sql, campoValor: cv, campoTexto: ct });
}
</script>

<style scoped>
.ticg { display: flex; flex-direction: column; gap: var(--e2); }

.ticg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 4px 10px; border-radius: 99px; border: 1px solid var(--borde);
  background: var(--fondo); color: var(--texto-suave); font-size: var(--t-sm);
  cursor: pointer; transition: background var(--transicion), border-color var(--transicion);
}
.chip:hover, .chip.activo {
  background: var(--simple-suave); border-color: var(--primary); color: var(--primary);
}

.ticg-libre { display: flex; gap: var(--e2); }
.ticg-libre .cinput { flex: 1; }

.ticg-cols { display: flex; gap: var(--e3); }
.ticg-sel { display: flex; flex-direction: column; gap: 4px; flex: 1; font-size: var(--t-sm); }
.ticg-sel label { color: var(--texto-suave); }

.ticg-error { color: var(--error); font-size: var(--t-sm); }
</style>
