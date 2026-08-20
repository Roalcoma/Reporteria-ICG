<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-backdrop" @click.self="cerrar">
        <div class="modal-card" role="dialog" aria-modal="true" tabindex="-1">
          <div class="modal-icono modal-icono--info">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </div>

          <h3 class="modal-titulo">Nuevo Reporte</h3>

          <div class="campo">
            <label for="nr-nombre">Nombre <span class="req">*</span></label>
            <input
              id="nr-nombre"
              ref="nombreRef"
              v-model="form.Nombre"
              type="text"
              placeholder="Ej: Ventas por cliente"
              @keydown.enter="form.Nombre.trim() && !cargando && crear()"
              @keydown.esc="cerrar"
            />
          </div>

          <div class="campos-fila">
            <div class="campo">
              <label for="nr-tipo">Tipo</label>
              <select id="nr-tipo" v-model="form.Tipo">
                <option value="SIMPLE">Simple</option>
                <option value="MASTER_DETAIL">Multinivel</option>
              </select>
            </div>
            <div class="campo">
              <label for="nr-area">Área</label>
              <select id="nr-area" v-model="form.Area">
                <option value="GESTION">Gestión</option>
                <option value="CONTABLE">Contable</option>
              </select>
            </div>
          </div>

          <div class="modal-acciones">
            <button class="btn btn-ghost" @click="cerrar" :disabled="cargando">Cancelar</button>
            <button class="btn btn-primary" @click="crear" :disabled="!form.Nombre.trim() || cargando">
              <span v-if="cargando" class="spinner" />
              Crear reporte
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { api } from '@/api.js';
import { useToast } from '@/composables/useToast.js';

const props = defineProps({
  modelValue: Boolean,
  carpetaId:  { type: Number, default: null },
});
const emit  = defineEmits(['update:modelValue', 'creado']);
const toast = useToast();

const nombreRef = ref(null);
const cargando  = ref(false);
const form      = ref({ Nombre: '', Tipo: 'SIMPLE', Area: 'GESTION' });

watch(() => props.modelValue, async (v) => {
  if (v) {
    form.value = { Nombre: '', Tipo: 'SIMPLE', Area: 'GESTION' };
    await nextTick();
    nombreRef.value?.focus();
  }
});

function cerrar() {
  if (!cargando.value) emit('update:modelValue', false);
}

async function crear() {
  const nombre = form.value.Nombre.trim();
  if (!nombre || cargando.value) return;
  cargando.value = true;
  try {
    const nuevo = await api.crearReporte({
      reporte: { Nombre: nombre, Tipo: form.value.Tipo, Area: form.value.Area, CarpetaId: props.carpetaId },
      consultas: [], parametros: [], columnas: []
    });
    toast.ok(`Reporte "${nombre}" creado`);
    emit('creado', nuevo);
    cerrar();
  } catch (e) {
    toast.error(e.message);
  } finally {
    cargando.value = false;
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
  padding: 16px;
}
.modal-card {
  background: var(--panel);
  border-radius: 16px;
  padding: 28px 28px 24px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 24px 64px rgba(15,23,42,.22), 0 4px 16px rgba(15,23,42,.10);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-icono {
  width: 48px; height: 48px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.modal-icono--info { background: #EFF6FF; color: var(--primary); }
.modal-titulo {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--texto);
}
.campos-fila {
  display: flex;
  gap: var(--e3);
}
.campos-fila .campo { flex: 1; }
.req { color: var(--error); }
.modal-acciones {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* reutiliza animaciones del AppModal global */
.modal-enter-active { transition: opacity 200ms ease; }
.modal-leave-active { transition: opacity 160ms ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .modal-card {
  animation: cardEntrar 220ms cubic-bezier(0.34,1.56,0.64,1) both;
}
.modal-leave-active .modal-card {
  animation: cardSalir 160ms ease-in both;
}
@keyframes cardEntrar {
  from { transform: scale(0.93) translateY(12px); opacity: 0; }
  to   { transform: scale(1)    translateY(0);    opacity: 1; }
}
@keyframes cardSalir {
  from { transform: scale(1)    translateY(0);    opacity: 1; }
  to   { transform: scale(0.95) translateY(8px);  opacity: 0; }
}
</style>
