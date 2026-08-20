<template>
  <div class="act-view">
    <div class="act-header">
      <h1 class="act-title">Actualización del sistema</h1>
      <p class="act-sub">Compará la versión instalada con la última release de GitHub y aplicá la actualización en el servidor.</p>
    </div>

    <!-- Card: estado de versión -->
    <div class="act-card">
      <div class="act-card-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <span class="act-card-title">Versión instalada</span>
      </div>

      <!-- Cargando -->
      <div v-if="estado === 'cargando'" class="act-cargando">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
        </svg>
        Consultando GitHub…
      </div>

      <!-- Error -->
      <div v-else-if="estado === 'error'" class="act-error-msg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        {{ errorMsg }}
      </div>

      <!-- Resultado -->
      <template v-else-if="info">
        <div class="act-versiones">
          <div class="act-ver-item">
            <span class="act-ver-label">Versión instalada</span>
            <span class="act-ver-value">{{ info.versionActual }}</span>
          </div>
          <div class="act-ver-sep">→</div>
          <div class="act-ver-item">
            <span class="act-ver-label">Última release</span>
            <span class="act-ver-value">{{ info.tagRemoto }}</span>
          </div>
          <div class="act-badge" :class="hayActualizacion ? 'act-badge--nuevo' : 'act-badge--ok'">
            <template v-if="hayActualizacion">
              Actualización disponible: {{ info.tagRemoto }}
            </template>
            <template v-else>
              Al día
            </template>
          </div>
        </div>
      </template>

      <button class="btn-verificar" :disabled="estado === 'cargando' || estado === 'aplicando'" @click="verificar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4v5h.582M20 20v-5h-.581M4.582 9a8 8 0 0115.408 0M19.418 15a8 8 0 01-15.408 0"/>
        </svg>
        Verificar ahora
      </button>
    </div>

    <!-- Card: aplicar actualización (solo si hay nueva versión y es admin) -->
    <div v-if="hayActualizacion && esAdmin" class="act-card act-card--aplicar">
      <div class="act-card-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        <span class="act-card-title">Aplicar actualización</span>
      </div>

      <div class="act-info-archivo">
        Se descargará <strong>{{ info.nombreArchivo }}</strong> y se extraerá sobreescribiendo los archivos del servidor. El servicio deberá reiniciarse manualmente después.
      </div>

      <div class="act-aviso">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <path d="M12 9v4M12 17h.01"/>
        </svg>
        Asegurate de hacer un backup antes de actualizar.
      </div>

      <!-- Éxito -->
      <div v-if="estado === 'exito'" class="act-exito">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Archivos actualizados correctamente. Reiniciá el servidor para aplicar los cambios.
      </div>

      <!-- Error al aplicar -->
      <div v-if="estado === 'errorAplicar'" class="act-error-msg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        {{ errorMsg }}
      </div>

      <button
        class="btn-aplicar"
        :disabled="estado === 'aplicando' || estado === 'exito'"
        @click="aplicar"
      >
        <svg v-if="estado === 'aplicando'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        {{ estado === 'aplicando' ? 'Descargando e instalando…' : 'Descargar e instalar' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api.js';
import { useToast } from '@/composables/useToast.js';
import { useSessionStore } from '@/stores/session.js';

const toast   = useToast();
const session = useSessionStore();

const esAdmin = computed(() => session.isAdmin);

// 'cargando' | 'error' | 'actualizado' | 'disponible' | 'aplicando' | 'exito' | 'errorAplicar'
const estado   = ref('cargando');
const info     = ref(null);
const errorMsg = ref('');

const hayActualizacion = computed(() => {
  if (!info.value) return false;
  return info.value.tagRemoto !== `v${info.value.versionActual}` &&
         info.value.tagRemoto !== info.value.versionActual;
});

async function verificar() {
  estado.value  = 'cargando';
  errorMsg.value = '';
  try {
    info.value   = await api.checkActualizacion();
    estado.value = hayActualizacion.value ? 'disponible' : 'actualizado';
  } catch (e) {
    estado.value  = 'error';
    errorMsg.value = e.message;
  }
}

async function aplicar() {
  if (!info.value?.urlDescarga) return;
  estado.value   = 'aplicando';
  errorMsg.value = '';
  try {
    await api.aplicarActualizacion(info.value.urlDescarga);
    estado.value = 'exito';
    toast.ok('Archivos actualizados. Reiniciá el servidor para aplicar los cambios.');
  } catch (e) {
    estado.value  = 'errorAplicar';
    errorMsg.value = e.message;
    toast.error(e.message);
  }
}

onMounted(verificar);
</script>

<style scoped>
.act-view {
  display: flex;
  flex-direction: column;
  gap: var(--e4);
  padding: var(--e4);
  max-width: 680px;
}

.act-header { display: flex; flex-direction: column; gap: 4px; }
.act-title  { font-size: var(--t-xl); font-weight: 700; color: var(--titulo); margin: 0; }
.act-sub    { font-size: var(--t-sm); color: var(--texto-tenue); margin: 0; }

/* Tarjetas */
.act-card {
  background: var(--panel);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  padding: var(--e4);
  display: flex;
  flex-direction: column;
  gap: var(--e3);
}
.act-card--aplicar { border-color: var(--accent); }

.act-card-header {
  display: flex;
  align-items: center;
  gap: var(--e2);
  color: var(--texto-suave);
}
.act-card-title {
  font-size: var(--t-base);
  font-weight: 600;
  color: var(--titulo);
}

/* Estado cargando */
.act-cargando {
  display: flex;
  align-items: center;
  gap: var(--e2);
  font-size: var(--t-sm);
  color: var(--texto-tenue);
}

/* Error */
.act-error-msg {
  display: flex;
  align-items: flex-start;
  gap: var(--e2);
  font-size: var(--t-sm);
  color: var(--error);
  background: color-mix(in srgb, var(--panel-alt) 80%, var(--error) 8%);
  border: 1px solid color-mix(in srgb, var(--borde-fuerte) 60%, var(--error) 30%);
  border-radius: var(--r1);
  padding: var(--e2) var(--e3);
}
.act-error-msg svg { flex-shrink: 0; margin-top: 1px; }

/* Versiones */
.act-versiones {
  display: flex;
  align-items: center;
  gap: var(--e3);
  flex-wrap: wrap;
}
.act-ver-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.act-ver-label {
  font-size: var(--t-xs);
  color: var(--texto-tenue);
  text-transform: uppercase;
  letter-spacing: .04em;
  font-weight: 600;
}
.act-ver-value {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--titulo);
  font-family: monospace;
}
.act-ver-sep {
  font-size: var(--t-lg);
  color: var(--texto-tenue);
  margin-top: 12px;
}

.act-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: var(--t-sm);
  font-weight: 600;
  margin-top: 12px;
}
.act-badge--ok {
  background: color-mix(in srgb, var(--panel-alt) 60%, #22c55e 15%);
  color: #22c55e;
  border: 1px solid color-mix(in srgb, var(--borde-fuerte) 40%, #22c55e 30%);
}
.act-badge--nuevo {
  background: color-mix(in srgb, var(--panel-alt) 60%, #f59e0b 15%);
  color: #f59e0b;
  border: 1px solid color-mix(in srgb, var(--borde-fuerte) 40%, #f59e0b 30%);
}

/* Botón verificar */
.btn-verificar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r1);
  background: transparent;
  color: var(--texto-suave);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
  transition: background var(--transicion), color var(--transicion);
}
.btn-verificar:hover:not(:disabled) {
  background: var(--panel-alt);
  color: var(--texto);
}
.btn-verificar:disabled { opacity: .45; cursor: not-allowed; }

/* Info archivo */
.act-info-archivo {
  font-size: var(--t-sm);
  color: var(--texto-suave);
  line-height: 1.55;
}
.act-info-archivo strong { color: var(--texto); }

/* Aviso backup */
.act-aviso {
  display: flex;
  align-items: flex-start;
  gap: var(--e2);
  font-size: var(--t-sm);
  color: #f59e0b;
  background: color-mix(in srgb, var(--panel-alt) 80%, #f59e0b 8%);
  border: 1px solid color-mix(in srgb, var(--borde-fuerte) 40%, #f59e0b 25%);
  border-radius: var(--r1);
  padding: var(--e2) var(--e3);
}
.act-aviso svg { flex-shrink: 0; margin-top: 1px; }

/* Éxito */
.act-exito {
  display: flex;
  align-items: flex-start;
  gap: var(--e2);
  font-size: var(--t-sm);
  color: #22c55e;
  background: color-mix(in srgb, var(--panel-alt) 80%, #22c55e 8%);
  border: 1px solid color-mix(in srgb, var(--borde-fuerte) 40%, #22c55e 25%);
  border-radius: var(--r1);
  padding: var(--e2) var(--e3);
}
.act-exito svg { flex-shrink: 0; margin-top: 1px; }

/* Botón aplicar */
.btn-aplicar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: var(--r1);
  background: var(--accent);
  color: #fff;
  font-size: var(--t-base);
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
  transition: opacity var(--transicion);
}
.btn-aplicar:not(:disabled):hover { opacity: .88; }
.btn-aplicar:disabled { opacity: .45; cursor: not-allowed; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }
</style>
