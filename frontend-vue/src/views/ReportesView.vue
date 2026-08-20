<template>
  <div class="reportes-view">
    <ArbolReportes class="arbol-panel" @select="seleccionar" @creado="onCreado" />

    <div class="viewer-panel">
      <!-- Nada seleccionado -->
      <div v-if="!seleccionado" class="empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 9h6M9 12h6M9 15h4"/>
        </svg>
        <p>Selecciona un reporte del árbol</p>
      </div>

      <!-- Reporte seleccionado -->
      <template v-else>
        <!-- Barra modo (solo editores) -->
        <div v-if="puedeEditar" class="modo-bar">
          <button
            class="modo-btn"
            :class="{ activo: modo === 'ejecutar' }"
            @click="modo = 'ejecutar'"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Ejecutar
          </button>
          <button
            class="modo-btn"
            :class="{ activo: modo === 'editar' }"
            @click="modo = 'editar'"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>
            </svg>
            Editar
          </button>
        </div>

        <!-- Vista ejecutar -->
        <ReporteViewer
          v-if="modo === 'ejecutar'"
          :reporte="seleccionado"
          class="viewer-contenido"
        />

        <!-- Vista editar -->
        <ReporteEditor
          v-else
          :reporte="seleccionado"
          class="viewer-contenido"
          @guardado="onGuardado"
          @cerrar="modo = 'ejecutar'"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSessionStore } from '@/stores/session.js';
import ArbolReportes from '@/components/reportes/ArbolReportes.vue';
import ReporteViewer from '@/components/reportes/ReporteViewer.vue';
import ReporteEditor from '@/components/reportes/ReporteEditor.vue';

const session     = useSessionStore();
const seleccionado = ref(null);
const modo        = ref('ejecutar');

const puedeEditar = computed(() => {
  const p = session.user?.permisos || {};
  return !!(p.PuedeCrear || p.PuedeEditar);
});

// Al cambiar de reporte, volver siempre a modo ejecutar
watch(seleccionado, () => { modo.value = 'ejecutar'; });

function seleccionar(reporte) {
  seleccionado.value = reporte;
}

// Nuevo reporte creado desde el árbol → abrir directo en editar
function onCreado(reporte) {
  seleccionado.value = reporte;
  modo.value = 'editar';
}

// Guardado exitoso → actualizar objeto seleccionado (refleja nombre nuevo, etc.)
function onGuardado(reporteActualizado) {
  seleccionado.value = { ...seleccionado.value, ...reporteActualizado };
  modo.value = 'ejecutar';
}
</script>

<style scoped>
.reportes-view {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.arbol-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--borde-fuerte);
  overflow-y: auto;
  background: var(--panel);
}
.viewer-panel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Barra de modo ejecutar / editar */
.modo-bar {
  display: flex;
  gap: 2px;
  padding: var(--e2) var(--e4);
  border-bottom: 1px solid var(--borde-fuerte);
  background: var(--panel);
  flex-shrink: 0;
}
.modo-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px var(--e4);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: transparent;
  color: var(--texto-suave);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transicion), color var(--transicion), border-color var(--transicion);
}
.modo-btn:hover { color: var(--texto); background: var(--muted); }
.modo-btn.activo {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.viewer-contenido {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
</style>
