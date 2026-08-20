<template>
  <li>
    <div
      class="reporte-fila"
      :class="{ activo: arbol.seleccionado.value === r.ReporteId }"
      :style="{ paddingLeft: sangria + 'px' }"
      :title="`${t.etiqueta}${r.Descripcion ? ' — ' + r.Descripcion : ''}`"
      @click="arbol.seleccionar(r)"
    >
      <span class="tipo-dot" :class="t.clase" />
      <span class="reporte-nombre">{{ r.Nombre }}</span>
      <span class="tipo-tag badge" :class="t.clase">{{ t.etiqueta }}</span>
      <span v-if="arbol.puedeEditar.value" class="fila-acciones">
        <button title="Duplicar" @click.stop="arbol.duplicar(r)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
        <button title="Eliminar" @click.stop="arbol.borrarReporte(r)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </span>
    </div>
  </li>
</template>

<script setup>
import { computed, inject } from 'vue';

const props = defineProps({ r: Object, sangria: { type: Number, default: 4 } });
const arbol = inject('arbol');

const t = computed(() => arbol.TIPO_INFO[props.r.Tipo] || arbol.TIPO_INFO.SIMPLE);
</script>

<style scoped>
.reporte-fila {
  display: flex;
  align-items: center;
  gap: var(--e2);
  padding: 5px var(--e2) 5px 0;
  cursor: pointer;
  border-radius: var(--r1);
  transition: background var(--transicion);
}
.reporte-fila:hover { background: var(--muted); }
.reporte-fila.activo { background: var(--simple-suave); }
.reporte-fila:hover .fila-acciones { opacity: 1; }

.tipo-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.badge-simple     { background: var(--simple); }
.badge-multinivel { background: var(--multinivel); }
.badge-dashboard  { background: var(--dashboard); }

.reporte-nombre {
  flex: 1;
  font-size: var(--t-base);
  color: var(--texto);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tipo-tag {
  font-size: var(--t-xs);
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}
.tipo-tag.badge-simple     { background: var(--simple-suave);    color: var(--simple); }
.tipo-tag.badge-multinivel { background: var(--multinivel-suave); color: var(--multinivel); }
.tipo-tag.badge-dashboard  { background: var(--dashboard-suave); color: var(--dashboard); }

.fila-acciones {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transicion);
  flex-shrink: 0;
}
.fila-acciones button {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  border: none; background: transparent;
  color: var(--texto-tenue);
  cursor: pointer;
  border-radius: var(--r1);
  transition: color var(--transicion), background var(--transicion);
}
.fila-acciones button:hover { color: var(--texto); background: var(--borde-fuerte); }
</style>
