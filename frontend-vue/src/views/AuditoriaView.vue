<template>
  <!-- Sin acceso -->
  <div v-if="!tieneAcceso" class="stub-view">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <h2>Auditoría</h2>
    <p>No tiene permiso para acceder a este módulo.</p>
  </div>

  <div v-else class="aud-view">

    <!-- ===== SECCIÓN ESTADÍSTICAS ===== -->
    <section class="aud-stats">
      <div class="sec-header">
        <h2 class="sec-title">Resumen de actividad</h2>
        <div class="periodo-tabs">
          <button
            v-for="d in [7, 30, 90]" :key="d"
            class="tab-btn" :class="{ activo: periodo === d }"
            @click="setPeriodo(d)"
          >{{ d }}d</button>
        </div>
      </div>

      <div v-if="cargandoStats" class="loading-line">Cargando estadísticas…</div>

      <template v-else-if="stats">
        <div class="kpi-row">
          <div class="kpi">
            <span class="kpi-n">{{ stats.totales.Ejecuciones ?? 0 }}</span>
            <span class="kpi-l">Ejecuciones</span>
          </div>
          <div class="kpi">
            <span class="kpi-n">{{ stats.totales.UsuariosActivos ?? 0 }}</span>
            <span class="kpi-l">Usuarios activos</span>
          </div>
          <div class="kpi">
            <span class="kpi-n">{{ stats.totales.ReportesUsados ?? 0 }}</span>
            <span class="kpi-l">Reportes usados</span>
          </div>
          <div class="kpi kpi--err">
            <span class="kpi-n">{{ stats.totales.Errores ?? 0 }}</span>
            <span class="kpi-l">Errores</span>
          </div>
        </div>

        <div v-if="stats.masUsados?.length" class="top-bloque">
          <h3 class="top-titulo">Top reportes</h3>
          <div class="top-lista">
            <div
              v-for="(r, i) in stats.masUsados.slice(0, 5)"
              :key="r.ReporteId"
              class="top-item"
            >
              <span class="top-rank">{{ i + 1 }}</span>
              <span class="top-nombre">{{ r.Nombre }}</span>
              <span class="top-cnt">{{ r.Ejecuciones }}</span>
            </div>
          </div>
        </div>
      </template>
    </section>

    <!-- ===== SECCIÓN BITÁCORA ===== -->
    <section class="aud-log">
      <h2 class="sec-title">Bitácora de eventos</h2>

      <div class="filtros">
        <select v-model="f.tipo" class="f-ctrl">
          <option value="">Todos los tipos</option>
          <option v-for="t in tipos" :key="t.Tipo" :value="t.Tipo">
            {{ t.Tipo }} ({{ t.Total }})
          </option>
        </select>

        <input
          v-model="f.login"
          type="text"
          placeholder="Usuario"
          class="f-ctrl"
          @keydown.enter="buscar"
        />

        <input v-model="f.desde" type="date" class="f-ctrl" />
        <input v-model="f.hasta" type="date" class="f-ctrl" />

        <select v-model="f.exitoso" class="f-ctrl f-ctrl--sm">
          <option value="">Todos</option>
          <option value="1">Exitoso</option>
          <option value="0">Con error</option>
        </select>

        <button class="btn-buscar" :disabled="cargandoEvt" @click="buscar">
          {{ cargandoEvt ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>

      <div class="tabla-wrap">
        <div v-if="cargandoEvt && !eventos.length" class="loading-line">Cargando eventos…</div>

        <table v-else-if="eventos.length" class="tabla">
          <thead>
            <tr>
              <th class="col-fecha">Fecha</th>
              <th>Tipo</th>
              <th>Usuario</th>
              <th class="col-desc">Descripción</th>
              <th class="col-ok">OK</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in eventos" :key="e.EventoId">
              <td class="col-fecha mono">{{ fmtFecha(e.FechaEvento) }}</td>
              <td><span class="badge" :class="badgeCls(e.Tipo)">{{ e.Tipo }}</span></td>
              <td>{{ e.LoginICG || '—' }}</td>
              <td class="col-desc">{{ e.Descripcion || '—' }}</td>
              <td class="col-ok">
                <span v-if="e.Exitoso" class="ico-ok">✓</span>
                <span v-else class="ico-err">✗</span>
              </td>
            </tr>
          </tbody>
        </table>

        <p v-else-if="!cargandoEvt" class="empty-msg">
          Sin eventos para los filtros seleccionados.
        </p>
      </div>

      <div v-if="puedeCargarMas" class="cargar-mas">
        <button class="btn-mas" :disabled="cargandoEvt" @click="cargarMas">
          Cargar más
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useSessionStore } from '@/stores/session.js';
import { useToast } from '@/composables/useToast.js';
import { api } from '@/api.js';

const session = useSessionStore();
const toast   = useToast();

const tieneAcceso = computed(() => {
  const p = session.user?.permisos || {};
  return !!(p.PuedeEditar || p.PuedeCrear || p.PuedeProgramar || p.PuedeAdministrar);
});

// ---- Estadísticas ----
const periodo       = ref(30);
const stats         = ref(null);
const cargandoStats = ref(false);

async function cargarStats() {
  cargandoStats.value = true;
  try {
    stats.value = await api.estadisticas(periodo.value);
  } catch (e) {
    toast.error('Error al cargar estadísticas: ' + e.message);
  } finally {
    cargandoStats.value = false;
  }
}

function setPeriodo(d) {
  periodo.value = d;
  cargarStats();
}

// ---- Tipos de evento ----
const tipos = ref([]);

async function cargarTipos() {
  try {
    tipos.value = await api.auditoriaTipos();
  } catch { /* los filtros de tipo son opcionales */ }
}

// ---- Eventos ----
const TOP_PAG      = 200;
const f            = ref({ tipo: '', login: '', desde: '', hasta: '', exitoso: '' });
const eventos      = ref([]);
const topActual    = ref(TOP_PAG);
const cargandoEvt  = ref(false);

const puedeCargarMas = computed(
  () => eventos.value.length > 0 && eventos.value.length >= topActual.value && !cargandoEvt.value
);

async function buscar() {
  topActual.value = TOP_PAG;
  await _fetchEventos();
}

async function cargarMas() {
  topActual.value += TOP_PAG;
  await _fetchEventos();
}

async function _fetchEventos() {
  cargandoEvt.value = true;
  try {
    const q = { ...f.value, top: topActual.value };
    if (!q.exitoso) delete q.exitoso;
    eventos.value = await api.auditoriaEventos(q);
  } catch (e) {
    toast.error('Error al cargar eventos: ' + e.message);
  } finally {
    cargandoEvt.value = false;
  }
}

// ---- Helpers ----
function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
}

const BADGE_MAP = {
  LOGIN:               'b-ok',
  LOGIN_FALLIDO:       'b-err',
  LOGOUT:              'b-muted',
  EMPRESA_SELECCION:   'b-blue',
  REPORTE_CREAR:       'b-primary',
  REPORTE_MODIFICAR:   'b-accent',
  REPORTE_ELIMINAR:    'b-err',
  REPORTE_VER:         'b-muted',
  REPORTE_EJECUTAR:    'b-primary',
  REPORTE_EXPORTAR:    'b-blue',
  REPORTE_ENVIAR:      'b-teal',
  REPORTE_IMPORTAR:    'b-purple',
  REPORTE_EXPORTAR_DEF:'b-blue',
  PROGRAMACION_CREAR:  'b-ok',
  PROGRAMACION_CAMBIAR:'b-accent',
  PROGRAMACION_ELIMINAR:'b-err',
  SQL_RECHAZADO:       'b-err',
};

const badgeCls = (tipo) => BADGE_MAP[tipo] || 'b-muted';

onMounted(() => {
  if (!tieneAcceso.value) return;
  cargarStats();
  cargarTipos();
  buscar();
});
</script>

<style scoped>
/* Layout raíz */
.stub-view {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--e3); height: 100%; color: var(--texto-tenue);
}
.stub-view h2 { font-size: var(--t-xl); font-weight: 700; color: var(--titulo); }
.stub-view svg { opacity: .3; }

.aud-view {
  display: flex;
  flex-direction: column;
  gap: var(--e5);
  padding: var(--e5);
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* Encabezado de sección */
.sec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--e4);
}
.sec-title {
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--titulo);
  margin: 0;
}

/* Selector de período */
.periodo-tabs { display: flex; gap: var(--e1); }
.tab-btn {
  padding: 4px 12px;
  border-radius: var(--r2);
  border: 1px solid var(--borde-fuerte);
  background: var(--panel);
  color: var(--texto-suave);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transicion), color var(--transicion), border-color var(--transicion);
}
.tab-btn:hover  { background: var(--muted); color: var(--texto); }
.tab-btn.activo { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }

/* KPIs */
.kpi-row {
  display: flex;
  gap: var(--e4);
  margin-bottom: var(--e4);
  flex-wrap: wrap;
}
.kpi {
  flex: 1;
  min-width: 120px;
  background: var(--panel);
  border: 1px solid var(--borde);
  border-radius: var(--r3);
  padding: var(--e4) var(--e5);
  display: flex;
  flex-direction: column;
  gap: var(--e1);
  box-shadow: var(--sombra1);
}
.kpi--err .kpi-n { color: var(--error); }
.kpi-n {
  font-size: var(--t-2xl);
  font-weight: 700;
  color: var(--titulo);
  line-height: 1;
}
.kpi-l {
  font-size: var(--t-sm);
  color: var(--texto-tenue);
  font-weight: 500;
}

/* Top reportes */
.top-bloque { margin-bottom: var(--e2); }
.top-titulo {
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--texto-suave);
  margin: 0 0 var(--e2) 0;
}
.top-lista {
  background: var(--panel);
  border: 1px solid var(--borde);
  border-radius: var(--r3);
  overflow: hidden;
  box-shadow: var(--sombra1);
}
.top-item {
  display: flex;
  align-items: center;
  gap: var(--e3);
  padding: var(--e2) var(--e4);
  border-bottom: 1px solid var(--muted);
  font-size: var(--t-base);
}
.top-item:last-child { border-bottom: none; }
.top-rank {
  width: 20px;
  text-align: center;
  font-weight: 700;
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  flex-shrink: 0;
}
.top-nombre { flex: 1; color: var(--texto); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top-cnt {
  font-weight: 600;
  color: var(--primary);
  font-size: var(--t-sm);
  flex-shrink: 0;
}

/* Sección log */
.aud-log { display: flex; flex-direction: column; gap: var(--e3); }

/* Filtros */
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e2);
  align-items: center;
}
.f-ctrl {
  height: 32px;
  padding: 0 var(--e2);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: var(--panel);
  color: var(--texto);
  font-size: var(--t-sm);
  font-family: var(--fuente);
  min-width: 130px;
  transition: border-color var(--transicion);
}
.f-ctrl:focus { outline: none; border-color: var(--foco); }
.f-ctrl--sm  { min-width: 110px; }
.btn-buscar {
  height: 32px;
  padding: 0 var(--e4);
  border: none;
  border-radius: var(--r2);
  background: var(--primary);
  color: var(--on-primary);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transicion);
}
.btn-buscar:hover:not(:disabled) { background: var(--primary-hover); }
.btn-buscar:disabled { opacity: .55; cursor: default; }

/* Tabla */
.tabla-wrap {
  background: var(--panel);
  border: 1px solid var(--borde);
  border-radius: var(--r3);
  overflow: auto;
  box-shadow: var(--sombra1);
  max-height: 60vh;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-base);
}
.tabla th {
  position: sticky;
  top: 0;
  background: var(--panel-alt);
  padding: var(--e2) var(--e3);
  text-align: left;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texto-suave);
  border-bottom: 1px solid var(--borde);
  white-space: nowrap;
}
.tabla td {
  padding: var(--e2) var(--e3);
  border-bottom: 1px solid var(--muted);
  color: var(--texto);
  vertical-align: middle;
}
.tabla tr:last-child td { border-bottom: none; }
.tabla tr:hover td { background: var(--panel-alt); }

.col-fecha { width: 140px; white-space: nowrap; }
.col-desc  { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-ok    { width: 44px; text-align: center; }
.mono      { font-family: var(--fuente-mono); font-size: var(--t-sm); }

/* Íconos OK/error */
.ico-ok  { color: var(--ok);    font-weight: 700; font-size: var(--t-md); }
.ico-err { color: var(--error); font-weight: 700; font-size: var(--t-md); }

/* Badges */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--t-xs);
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: .02em;
}
.b-ok      { background: var(--ok-suave);           color: var(--ok); }
.b-err     { background: var(--error-suave);         color: var(--error); }
.b-muted   { background: var(--muted);               color: var(--texto-suave); }
.b-blue    { background: var(--simple-suave);        color: var(--simple); }
.b-primary { background: var(--simple-suave);        color: var(--primary); }
.b-accent  { background: var(--aviso-suave);         color: var(--aviso); }
.b-teal    { background: var(--dashboard-suave);     color: var(--dashboard); }
.b-purple  { background: var(--multinivel-suave);    color: var(--multinivel); }

/* Estados */
.loading-line {
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  padding: var(--e4);
}
.empty-msg {
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  padding: var(--e5);
  text-align: center;
}

/* Cargar más */
.cargar-mas { display: flex; justify-content: center; padding-top: var(--e2); }
.btn-mas {
  padding: 6px var(--e5);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: var(--panel);
  color: var(--texto-suave);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transicion), color var(--transicion);
}
.btn-mas:hover:not(:disabled) { background: var(--muted); color: var(--texto); }
.btn-mas:disabled { opacity: .55; cursor: default; }
</style>
