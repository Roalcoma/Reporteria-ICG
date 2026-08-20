import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api.js';

export const useReportesStore = defineStore('reportes', () => {
  const carpetas = ref([]);
  const todosReportes = ref([]);
  const seleccionado = ref(null); // reporte seleccionado para ver
  const cargando = ref(false);

  async function fetchArbol() {
    cargando.value = true;
    try {
      [carpetas.value, todosReportes.value] = await Promise.all([
        api.carpetas(),
        api.reportes()
      ]);
    } finally {
      cargando.value = false;
    }
  }

  function seleccionar(reporte) {
    seleccionado.value = reporte;
  }

  function limpiar() {
    carpetas.value = [];
    todosReportes.value = [];
    seleccionado.value = null;
  }

  return { carpetas, todosReportes, seleccionado, cargando, fetchArbol, seleccionar, limpiar };
});
