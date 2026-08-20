<template>
  <div v-if="parametros?.length" class="param-form">
    <div v-for="p in parametros" :key="p.ParametroId" class="campo">
      <label :for="`p-${p.ParametroId}`">{{ p.Etiqueta }}{{ p.Obligatorio ? ' *' : '' }}</label>

      <input v-if="p.ControlUI === 'FECHA'"
        :id="`p-${p.ParametroId}`"
        type="date"
        :value="valores[p.Nombre] ?? p.ValorDefault ?? ''"
        @change="set(p.Nombre, $event.target.value)"
      />

      <input v-else-if="p.ControlUI === 'BOOL'"
        :id="`p-${p.ParametroId}`"
        type="checkbox"
        :checked="!!valores[p.Nombre]"
        @change="set(p.Nombre, $event.target.checked)"
      />

      <select v-else-if="(p.ControlUI === 'LISTA_ESTATICA' || p.ControlUI === 'LISTA_SQL') && p.PermiteMultiple"
        :id="`p-${p.ParametroId}`"
        multiple
        :size="Math.min(6, Math.max(3, opcionesDe(p).length))"
        :value="Array.isArray(valores[p.Nombre]) ? valores[p.Nombre] : []"
        @change="set(p.Nombre, [...$event.target.selectedOptions].map(o => o.value))"
      >
        <option v-for="o in opcionesDe(p)" :key="o.valor" :value="o.valor">{{ o.texto }}</option>
      </select>

      <select v-else-if="p.ControlUI === 'LISTA_ESTATICA' || p.ControlUI === 'LISTA_SQL'"
        :id="`p-${p.ParametroId}`"
        :value="valores[p.Nombre] ?? p.ValorDefault ?? ''"
        @change="set(p.Nombre, $event.target.value)"
      >
        <option value="">(seleccione)</option>
        <option v-for="o in opcionesDe(p)" :key="o.valor" :value="o.valor">{{ o.texto }}</option>
      </select>

      <input v-else
        :id="`p-${p.ParametroId}`"
        :type="p.TipoDato === 'INT' || p.TipoDato === 'DECIMAL' ? 'number' : 'text'"
        :value="valores[p.Nombre] ?? p.ValorDefault ?? ''"
        @input="set(p.Nombre, $event.target.value)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { api } from '@/api.js';

const props = defineProps({
  reporteId:  { type: Number, required: true },
  parametros: { type: Array, default: () => [] },
  seleccion:  { type: Object, default: () => ({}) },
  valores:    { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:valores']);

const opcionesSql = ref({});

function set(nombre, valor) {
  emit('update:valores', { ...props.valores, [nombre]: valor });
}

function opcionesDe(p) {
  if (p.ControlUI === 'LISTA_SQL') return opcionesSql.value[p.ParametroId] || [];
  return (p.opciones || []).map(o => ({ valor: o.Valor, texto: o.Texto }));
}

async function cargarOpciones() {
  const listaSql = (props.parametros || []).filter(p => p.ControlUI === 'LISTA_SQL');
  if (!listaSql.length || props.seleccion.codEmpresa == null) return;
  const pares = await Promise.all(
    listaSql.map(p =>
      api.opcionesParam(props.reporteId, p.ParametroId, props.seleccion)
        .then(ops => [p.ParametroId, ops])
        .catch(e => { console.warn(`[ParametrosForm] opciones ${p.Nombre}:`, e?.message); return [p.ParametroId, []]; })
    )
  );
  opcionesSql.value = Object.fromEntries(pares);
}

watch(() => [props.reporteId, props.seleccion.codEmpresa, props.seleccion.ejercicio], cargarOpciones, { immediate: true });
</script>

<style scoped>
.param-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e3);
}
.param-form .campo { min-width: 180px; flex: 1; }
</style>
