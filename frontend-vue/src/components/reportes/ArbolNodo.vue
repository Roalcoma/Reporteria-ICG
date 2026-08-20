<template>
  <li v-if="!arbol.buscando.value || arbol.tieneCoincidencias(carpeta.CarpetaId)">
    <div class="carpeta-fila" :style="{ paddingLeft: nivel * 12 + 'px' }">
      <button class="carpeta-titulo" @click="toggle">
        <span class="chevron">{{ abierta ? '▾' : '▸' }}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
        {{ carpeta.Nombre }}
      </button>
      <span v-if="arbol.puedeEditar.value" class="fila-acciones">
        <button title="Nuevo reporte aquí" @click.stop="arbol.nuevoReporte(carpeta.CarpetaId)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button title="Nueva subcarpeta" @click.stop="arbol.nuevaCarpeta(carpeta.CarpetaId)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button title="Renombrar" @click.stop="arbol.renombrarCarpeta(carpeta)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
        </button>
        <button title="Eliminar carpeta" @click.stop="arbol.borrarCarpeta(carpeta)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
        </button>
      </span>
    </div>
    <ul v-if="abierta">
      <ArbolNodo
        v-for="h in arbol.hijasDe(carpeta.CarpetaId)"
        :key="h.CarpetaId"
        :carpeta="h"
        :nivel="nivel + 1"
      />
      <ArbolFila
        v-for="r in arbol.deCarpeta(carpeta.CarpetaId)"
        :key="r.ReporteId"
        :r="r"
        :sangria="(nivel + 1) * 12 + 14"
      />
    </ul>
  </li>
</template>

<script setup>
import { computed, inject } from 'vue';
import ArbolFila from './ArbolFila.vue';

const props = defineProps({ carpeta: Object, nivel: { type: Number, default: 0 } });
const arbol = inject('arbol');

const abierta = computed(() =>
  arbol.buscando.value || !!arbol.abiertas.value[props.carpeta.CarpetaId]
);

function toggle() {
  arbol.abiertas.value[props.carpeta.CarpetaId] = !arbol.abiertas.value[props.carpeta.CarpetaId];
}
</script>

<style scoped>
.carpeta-fila {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: var(--e2);
}
.carpeta-fila:hover .fila-acciones { opacity: 1; }

.carpeta-titulo {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  padding: 5px var(--e2) 5px 0;
  border: none;
  background: transparent;
  color: var(--texto-suave);
  font-size: var(--t-base);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  border-radius: var(--r1);
  transition: color var(--transicion), background var(--transicion);
}
.carpeta-titulo:hover { color: var(--texto); background: var(--muted); }
.chevron { font-size: 10px; width: 12px; flex-shrink: 0; }

.fila-acciones {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transicion);
}
.fila-acciones button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  border: none;
  background: transparent;
  color: var(--texto-tenue);
  cursor: pointer;
  border-radius: var(--r1);
  transition: color var(--transicion), background var(--transicion);
}
.fila-acciones button:hover { color: var(--texto); background: var(--muted); }

ul { list-style: none; }
</style>
