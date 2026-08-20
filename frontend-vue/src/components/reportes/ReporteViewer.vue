<template>
  <div class="viewer">
    <div v-if="!def && !loadError" class="empty"><div class="spinner" /></div>
    <div v-else-if="loadError" class="empty" style="color:var(--error)">{{ loadError }}</div>

    <template v-else-if="def">
      <!-- Cabecera -->
      <header class="viewer-head">
        <div>
          <h2 class="viewer-titulo">{{ def.reporte.Nombre }}</h2>
          <p v-if="def.reporte.Descripcion" class="viewer-desc">{{ def.reporte.Descripcion }}</p>
        </div>
        <span class="badge" :class="esContable ? 'badge-contable' : 'badge-gestion'">
          {{ def.reporte.Area }}
        </span>
      </header>

      <!-- Filtros -->
      <section class="filtros-section">
        <div class="campo" v-if="esContable">
          <label>Empresa contable / ejercicio</label>
          <select v-model="claveSeleccionada" @change="onEmpresaChange">
            <option v-if="!empresas.length" value="">Sin empresas contables</option>
            <option v-for="emp in empresas" :key="claveEmp(emp)" :value="claveEmp(emp)">
              {{ emp.nombre }}{{ emp.ejercicio ? ` — ${emp.ejercicio}` : '' }}
            </option>
          </select>
        </div>
        <div class="campo" v-else>
          <label>Empresa</label>
          <input :value="empresaGestion?.nombre || empresaGestion?.codEmpresa || ''" disabled />
        </div>

        <ParametrosForm
          :reporteId="reporte.ReporteId"
          :parametros="def.parametros"
          :seleccion="seleccion"
          v-model:valores="valores"
        />

        <button class="btn btn-primary" @click="ejecutar" :disabled="cargando">
          <span v-if="cargando" class="spinner" />
          {{ cargando ? 'Ejecutando…' : 'Ejecutar' }}
        </button>
      </section>


      <!-- Resultados -->
      <section v-if="resultado" class="resultado-section">
        <!-- Barra de exportación -->
        <div class="acciones-bar">
          <div class="acciones-grupo">
            <button class="btn btn-primary" @click="exportar('PDF')" :disabled="!!exportandoFormato">
              <span v-if="exportandoFormato === 'PDF'" class="spinner" />
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              PDF
            </button>
            <select v-model="pdfOrientacion" title="Orientación">
              <option value="VERTICAL" :disabled="!puedeVertical">Vertical</option>
              <option value="HORIZONTAL">Horizontal</option>
            </select>
            <select v-model="pdfHoja" title="Tamaño de hoja">
              <option v-for="h in HOJAS" :key="h.id" :value="h.id">{{ h.label }}</option>
            </select>
          </div>
          <div class="acciones-grupo">
            <button v-for="f in OTROS_FORMATOS" :key="f" class="btn btn-ghost"
              @click="exportar(f)" :disabled="!!exportandoFormato">
              <span v-if="exportandoFormato === f" class="spinner" />
              <template v-else>{{ f }}</template>
            </button>
            <button class="btn btn-ghost" @click="mailAbierto = !mailAbierto">Enviar por correo</button>
          </div>
        </div>

        <!-- Enviar correo -->
        <div v-if="mailAbierto" class="mail-box panel">
          <template>
            <div class="campo">
              <label>Destinatarios</label>
              <input v-model="mailDest" placeholder="separados por ;" />
            </div>
            <div class="campo">
              <label>Asunto</label>
              <input v-model="mailAsunto" />
            </div>
            <div class="campo">
              <label>Formato</label>
              <select v-model="mailFormato">
                <option v-for="f in FORMATOS" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
            <div class="mail-acciones">
              <button class="btn btn-primary" :disabled="!mailDest || mailEnviando" @click="enviarCorreo">
                <span v-if="mailEnviando" class="spinner" />
                {{ mailEnviando ? 'Enviando…' : 'Enviar' }}
              </button>
              <button class="btn btn-ghost" @click="mailAbierto = false">Cancelar</button>
            </div>
          </template>
        </div>

        <!-- MASTER_DETAIL -->
        <template v-if="def.reporte.Tipo === 'MASTER_DETAIL'">
          <h3 class="resultado-subtitulo">Cabecera</h3>
          <DataGrid :rows="resultado.cabecera || []" :columnas="resultado.columnas" />
          <h3 class="resultado-subtitulo">Detalle</h3>
          <DataGrid :rows="resultado.detalle || []" :columnas="resultado.columnas" />
        </template>

        <!-- FLAT -->
        <DataGrid v-else :rows="resultado.rows || []" :columnas="resultado.columnas" />
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSessionStore } from '@/stores/session.js';
import { useToast } from '@/composables/useToast.js';
import { api } from '@/api.js';
import ParametrosForm from './ParametrosForm.vue';
import DataGrid from './DataGrid.vue';

const props = defineProps({ reporte: { type: Object, required: true } });

const session        = useSessionStore();
const toast          = useToast();
const empresaGestion = computed(() => session.empresaGestion);

const def        = ref(null);
const loadError  = ref('');
const empresas   = ref([]);
const seleccion  = ref({ codEmpresa: undefined, ejercicio: undefined });
const valores    = ref({});
const resultado  = ref(null);
const cargando   = ref(false);

const pdfOrientacion  = ref('VERTICAL');
const pdfHoja         = ref('A4');

const numColumnas = computed(() => {
  if (!resultado.value) return 0;
  const cols = resultado.value.columnas || [];
  if (cols.length) return cols.length;
  const rows = resultado.value.rows || resultado.value.cabecera || [];
  return rows[0] ? Object.keys(rows[0]).length : 0;
});
const puedeVertical = computed(() => numColumnas.value <= 15);
const exportandoFormato = ref(null);
const mailAbierto     = ref(false);
const mailDest        = ref('');
const mailAsunto      = ref('');
const mailFormato     = ref('EXCEL');
const mailEnviando    = ref(false);
const claveSeleccionada = ref('');

const esContable = computed(() => def.value?.reporte?.Area === 'CONTABLE');

const FORMATOS       = ['PDF', 'EXCEL', 'CSV', 'HTML', 'JSON', 'XML'];
const OTROS_FORMATOS = ['EXCEL', 'CSV', 'HTML', 'JSON', 'XML'];
const HOJAS = [
  { id: 'A4', label: 'A4' }, { id: 'A3', label: 'A3' },
  { id: 'LETTER', label: 'Carta' }, { id: 'LEGAL', label: 'Oficio' },
  { id: 'TABLOID', label: 'Tabloide' }
];

const claveEmp = (e) => `${e.codEmpresa}|${e.ejercicio ?? ''}`;

watch(() => props.reporte.ReporteId, async (id) => {
  def.value = null;
  resultado.value = null;
  loadError.value = '';
  valores.value = {};
  try {
    const d = await api.reporte(id);
    def.value = d;
    pdfOrientacion.value = d.reporte.OrientacionPdf || 'VERTICAL';
    pdfHoja.value        = d.reporte.TamanoHoja     || 'A4';
    if (d.reporte.Area === 'CONTABLE') {
      empresas.value = await api.empresas('CONTABLE');
      if (empresas.value[0]) {
        seleccion.value = { codEmpresa: empresas.value[0].codEmpresa, ejercicio: empresas.value[0].ejercicio };
        claveSeleccionada.value = claveEmp(empresas.value[0]);
      }
    } else {
      empresas.value  = [];
      seleccion.value = { codEmpresa: session.empresaGestion?.codEmpresa, ejercicio: undefined };
    }
  } catch (e) {
    loadError.value = e.message;
  }
}, { immediate: true });

// Si el usuario cambia de empresa de gestión, actualizar seleccion para que
// ParametrosForm vuelva a cargar las opciones LISTA_SQL con la empresa nueva.
watch(() => session.empresaGestion?.codEmpresa, (codEmpresa) => {
  if (!esContable.value) seleccion.value = { ...seleccion.value, codEmpresa };
});

function onEmpresaChange() {
  const emp = empresas.value.find(x => claveEmp(x) === claveSeleccionada.value);
  if (emp) seleccion.value = { codEmpresa: emp.codEmpresa, ejercicio: emp.ejercicio };
}

async function ejecutar() {
  cargando.value = true;
  try {
    resultado.value = await api.ejecutar(props.reporte.ReporteId, { ...seleccion.value, parametros: valores.value });
    if (!puedeVertical.value) pdfOrientacion.value = 'HORIZONTAL';
  } catch (e) {
    toast.error(e.message);
    resultado.value = null;
  } finally {
    cargando.value = false;
  }
}

async function exportar(formato) {
  if (exportandoFormato.value) return;
  exportandoFormato.value = formato;
  try {
    await api.exportar(props.reporte.ReporteId, {
      ...seleccion.value, parametros: valores.value, formato,
      orientacion: pdfOrientacion.value, tamanoHoja: pdfHoja.value
    });
  } catch (e) { toast.error(e.message); }
  finally { exportandoFormato.value = null; }
}

async function enviarCorreo() {
  mailEnviando.value = true;
  try {
    await api.enviar(props.reporte.ReporteId, {
      ...seleccion.value, parametros: valores.value,
      destinatarios: mailDest.value, asunto: mailAsunto.value, formato: mailFormato.value
    });
    toast.ok('Correo enviado correctamente');
    mailAbierto.value = false;
  } catch (e) { toast.error(e.message); }
  finally { mailEnviando.value = false; }
}
</script>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  gap: var(--e4);
  padding: var(--e5);
  height: 100%;
}

.viewer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--e4);
}
.viewer-titulo {
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--titulo);
}
.viewer-desc {
  font-size: var(--t-base);
  color: var(--texto-tenue);
  margin-top: 2px;
}

.badge { font-size: var(--t-xs); font-weight: 600; padding: 3px 8px; border-radius: 4px; }
.badge-gestion  { background: var(--simple-suave);    color: var(--simple); }
.badge-contable { background: var(--dashboard-suave); color: var(--dashboard); }

.filtros-section {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e3);
  align-items: flex-end;
  padding: var(--e4);
  background: var(--panel);
  border: 1px solid var(--borde);
  border-radius: var(--r3);
}
.filtros-section .campo { min-width: 200px; }
.filtros-section .btn   { align-self: flex-end; }

.resultado-section {
  display: flex;
  flex-direction: column;
  gap: var(--e4);
}

.acciones-bar {
  display: flex;
  gap: var(--e4);
  align-items: center;
  flex-wrap: wrap;
}
.acciones-grupo {
  display: flex;
  gap: var(--e2);
  align-items: center;
}
.acciones-grupo select {
  padding: 6px var(--e2);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: var(--panel);
  color: var(--texto);
  font-size: var(--t-sm);
}

.mail-box {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e3);
  padding: var(--e4);
  align-items: flex-end;
}
.mail-box .campo { min-width: 200px; flex: 1; }
.mail-acciones { display: flex; gap: var(--e2); align-self: flex-end; }

.resultado-subtitulo {
  font-size: var(--t-lg);
  font-weight: 600;
  color: var(--titulo);
  padding-bottom: var(--e2);
  border-bottom: 2px solid var(--borde);
}
</style>
