<template>
  <div class="usuarios-view">
    <!-- Encabezado -->
    <div class="uv-header">
      <div class="uv-header-left">
        <h1 class="uv-title">Gestión de usuarios</h1>
        <p class="uv-sub">Asigná roles y controlá el acceso al sistema de reportería</p>
      </div>
    </div>

    <!-- Barra de controles -->
    <div class="uv-toolbar">
      <!-- Filtro de texto -->
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          v-model="filtro"
          class="search-input"
          type="text"
          placeholder="Buscar por login o email…"
          @input="cargar"
        />
        <button v-if="filtro" class="search-clear" @click="filtro = ''; cargar()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Toggle solo asignados -->
      <label class="toggle-label">
        <button
          class="toggle-btn"
          :class="{ 'toggle-btn--on': soloAsignados }"
          role="switch"
          :aria-checked="soloAsignados"
          @click="soloAsignados = !soloAsignados; cargar()"
        >
          <span class="toggle-knob"></span>
        </button>
        Solo con rol asignado
      </label>

      <!-- Contador -->
      <span class="uv-count" v-if="!cargando">
        {{ usuariosFiltrados.length }} usuario{{ usuariosFiltrados.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Loading -->
    <div v-if="cargando" class="uv-loading">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/>
        <path d="M21 12a9 9 0 00-9-9"/>
      </svg>
      Cargando usuarios…
    </div>

    <!-- Tabla -->
    <div v-else-if="usuariosFiltrados.length" class="tabla-wrap">
      <table class="uv-tabla">
        <thead>
          <tr>
            <th>Login</th>
            <th>Email</th>
            <th>Rol actual</th>
            <th>Estado</th>
            <th class="th-acciones">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in usuariosFiltrados"
            :key="u.codUsuarioICG"
            :class="{ 'fila--yo': esSesionActual(u) }"
          >
            <!-- Login -->
            <td class="td-login">
              <span class="login-text">{{ u.login }}</span>
              <span v-if="u.esAdminBootstrap" class="badge badge--bootstrap">Bootstrap Admin</span>
              <span v-if="esSesionActual(u)" class="badge badge--yo">Tú</span>
            </td>

            <!-- Email -->
            <td class="td-email">{{ u.email || '—' }}</td>

            <!-- Rol -->
            <td class="td-rol">
              <span :class="badgeRol(u)">{{ u.rol || 'Sin asignar' }}</span>
            </td>

            <!-- Estado -->
            <td class="td-estado">
              <template v-if="u.usuarioAppId != null">
                <span v-if="u.activo" class="badge badge--activo">
                  <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>
                  Activo
                </span>
                <span v-else class="badge badge--inactivo">
                  <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>
                  Inactivo
                </span>
              </template>
              <span v-else class="td-na">—</span>
            </td>

            <!-- Acciones -->
            <td class="td-acciones">
              <div v-if="esSesionActual(u)" class="acciones-bloqueado">
                No puedes editar tu propio usuario
              </div>
              <div v-else class="acciones-row">
                <!-- Select de rol -->
                <select
                  class="rol-select"
                  :value="u.appRolId ?? ''"
                  @change="cambiarRol(u, $event.target.value)"
                  :disabled="!!pendiente[u.codUsuarioICG]"
                >
                  <option value="">— Sin rol —</option>
                  <option
                    v-for="r in roles"
                    :key="r.AppRolId"
                    :value="r.AppRolId"
                  >{{ r.Nombre }}</option>
                </select>

                <!-- Botón activar/desactivar (solo si tiene rol) -->
                <button
                  v-if="u.usuarioAppId != null"
                  class="btn-accion"
                  :class="u.activo ? 'btn-accion--warn' : 'btn-accion--ok'"
                  :disabled="!!pendiente[u.codUsuarioICG]"
                  :title="u.activo ? 'Desactivar acceso' : 'Activar acceso'"
                  @click="toggleActivo(u)"
                >
                  <svg v-if="u.activo" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M18.36 6.64A9 9 0 115.64 18.36"/><path d="M12 2v10"/>
                  </svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 2v10M18.36 6.64A9 9 0 115.64 18.36"/>
                  </svg>
                  {{ u.activo ? 'Desactivar' : 'Activar' }}
                </button>

                <!-- Botón quitar rol -->
                <button
                  v-if="u.usuarioAppId != null && !u.esAdminBootstrap"
                  class="btn-accion btn-accion--danger"
                  :disabled="!!pendiente[u.codUsuarioICG]"
                  title="Quitar rol (vuelve a Lectura)"
                  @click="quitarRol(u)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                  Quitar rol
                </button>

                <!-- Spinner de operación en curso -->
                <svg v-if="pendiente[u.codUsuarioICG]" class="spin accion-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/>
                  <path d="M21 12a9 9 0 00-9-9"/>
                </svg>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Vacío -->
    <div v-else class="uv-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".3">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
      <span>No se encontraron usuarios{{ filtro ? ' con ese filtro' : '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import { api } from '@/api.js';
import { useSessionStore } from '@/stores/session.js';
import { useToast } from '@/composables/useToast.js';

const session = useSessionStore();
const toast   = useToast();

const usuarios  = ref([]);
const roles     = ref([]);
const cargando  = ref(true);
const filtro    = ref('');
const soloAsignados = ref(false);
const pendiente = reactive({});   // { [codUsuarioICG]: true } mientras hay operación en vuelo

// Usuarios filtrados localmente por el filtro de texto (el soloAsignados ya lo filtra el backend)
const usuariosFiltrados = computed(() => usuarios.value);

function esSesionActual(u) {
  return session.user?.codUsuario != null && u.codUsuarioICG === session.user.codUsuario;
}

function badgeRol(u) {
  if (!u.appRolId) return 'badge badge--sin-rol';
  const nombre = (u.rol || '').toLowerCase();
  if (nombre.includes('admin'))   return 'badge badge--admin';
  if (nombre.includes('editor'))  return 'badge badge--editor';
  if (nombre.includes('lector'))  return 'badge badge--lector';
  return 'badge badge--lector';
}

async function cargar() {
  cargando.value = true;
  try {
    const [lista, listaRoles] = await Promise.all([
      api.usuarios({ filtro: filtro.value, soloAsignados: soloAsignados.value }),
      roles.value.length ? Promise.resolve(roles.value) : api.roles()
    ]);
    usuarios.value = lista;
    if (!roles.value.length) roles.value = listaRoles;
  } catch (e) {
    toast.error('Error cargando usuarios: ' + e.message);
  } finally {
    cargando.value = false;
  }
}

async function cambiarRol(u, nuevoRolId) {
  if (pendiente[u.codUsuarioICG]) return;
  const rolId = nuevoRolId === '' ? null : Number(nuevoRolId);

  // Si seleccionó "Sin rol" y ya tenía rol, usar quitarRol en su lugar
  if (rolId === null && u.usuarioAppId != null) {
    return quitarRol(u);
  }
  if (rolId === null) return; // nada que hacer

  pendiente[u.codUsuarioICG] = true;
  try {
    await api.asignarRol(u.codUsuarioICG, rolId, u.login);
    const rolNombre = roles.value.find(r => r.AppRolId === rolId)?.Nombre || '';
    toast.ok(`Rol "${rolNombre}" asignado a ${u.login}`);
    await cargar();
  } catch (e) {
    toast.error('Error asignando rol: ' + e.message);
  } finally {
    delete pendiente[u.codUsuarioICG];
  }
}

async function toggleActivo(u) {
  if (pendiente[u.codUsuarioICG]) return;
  pendiente[u.codUsuarioICG] = true;
  const nuevoEstado = !u.activo;
  try {
    await api.activarUsuario(u.codUsuarioICG, nuevoEstado);
    toast.ok(`${u.login} ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`);
    await cargar();
  } catch (e) {
    toast.error('Error actualizando estado: ' + e.message);
  } finally {
    delete pendiente[u.codUsuarioICG];
  }
}

async function quitarRol(u) {
  if (pendiente[u.codUsuarioICG] || u.esAdminBootstrap) return;
  pendiente[u.codUsuarioICG] = true;
  try {
    await api.quitarRol(u.codUsuarioICG);
    toast.aviso(`Rol quitado a ${u.login}`);
    await cargar();
  } catch (e) {
    toast.error('Error quitando rol: ' + e.message);
  } finally {
    delete pendiente[u.codUsuarioICG];
  }
}

onMounted(cargar);
</script>

<style scoped>
.usuarios-view {
  display: flex;
  flex-direction: column;
  gap: var(--e4);
  padding: var(--e4);
  max-width: 1200px;
}

/* Encabezado */
.uv-header        { display: flex; align-items: flex-start; justify-content: space-between; }
.uv-header-left   { display: flex; flex-direction: column; gap: 4px; }
.uv-title         { font-size: var(--t-xl); font-weight: 700; color: var(--titulo); margin: 0; }
.uv-sub           { font-size: var(--t-sm); color: var(--texto-tenue); margin: 0; }

/* Toolbar */
.uv-toolbar {
  display: flex;
  align-items: center;
  gap: var(--e3);
  flex-wrap: wrap;
}

/* Búsqueda */
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 10px;
  color: var(--texto-tenue);
  pointer-events: none;
}
.search-input {
  padding: 7px 32px 7px 32px;
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r1);
  background: var(--panel);
  color: var(--texto);
  font-size: var(--t-base);
  font-family: var(--fuente);
  width: 240px;
  transition: border-color var(--transicion);
}
.search-input:focus { outline: none; border-color: var(--primary); }
.search-clear {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--texto-tenue);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 2px;
}
.search-clear:hover { color: var(--texto); }

/* Toggle */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--t-sm);
  color: var(--texto-suave);
  cursor: pointer;
  user-select: none;
}
.toggle-btn {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: none;
  background: var(--borde-fuerte);
  cursor: pointer;
  transition: background var(--transicion);
  padding: 0;
}
.toggle-btn--on { background: var(--primary); }
.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--transicion);
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.toggle-btn--on .toggle-knob { transform: translateX(16px); }

.uv-count {
  font-size: var(--t-sm);
  color: var(--texto-tenue);
  margin-left: auto;
}

/* Loading */
.uv-loading {
  display: flex;
  align-items: center;
  gap: var(--e2);
  color: var(--texto-tenue);
  font-size: var(--t-sm);
  padding: var(--e5) 0;
}

/* Tabla */
.tabla-wrap {
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  overflow: hidden;
  overflow-x: auto;
}
.uv-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-base);
  background: var(--panel);
}
.uv-tabla thead {
  background: var(--panel-alt);
}
.uv-tabla th {
  padding: 10px var(--e3);
  text-align: left;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texto-suave);
  border-bottom: 1px solid var(--borde-fuerte);
  white-space: nowrap;
}
.th-acciones { text-align: right; }

.uv-tabla tbody tr {
  border-bottom: 1px solid var(--borde-fuerte);
  transition: background var(--transicion);
}
.uv-tabla tbody tr:last-child { border-bottom: none; }
.uv-tabla tbody tr:hover { background: var(--muted); }
.uv-tabla tbody tr.fila--yo { background: color-mix(in srgb, var(--panel) 90%, var(--primary) 10%); }

.uv-tabla td {
  padding: 10px var(--e3);
  color: var(--texto);
  vertical-align: middle;
}

/* Columnas específicas */
.td-login {
  display: flex;
  align-items: center;
  gap: var(--e2);
  flex-wrap: wrap;
  white-space: nowrap;
  min-width: 140px;
}
.login-text { font-weight: 600; }

.td-email  { color: var(--texto-suave); min-width: 180px; }
.td-rol    { min-width: 120px; }
.td-estado { min-width: 90px; }
.td-na     { color: var(--texto-tenue); }

/* Acciones */
.td-acciones { min-width: 320px; }
.acciones-row {
  display: flex;
  align-items: center;
  gap: var(--e2);
  justify-content: flex-end;
  flex-wrap: wrap;
}
.acciones-bloqueado {
  font-size: var(--t-xs);
  color: var(--texto-tenue);
  text-align: right;
  font-style: italic;
}

/* Select de rol */
.rol-select {
  padding: 5px var(--e2);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r1);
  background: var(--panel);
  color: var(--texto);
  font-size: var(--t-sm);
  font-family: var(--fuente);
  cursor: pointer;
  transition: border-color var(--transicion);
}
.rol-select:focus { outline: none; border-color: var(--primary); }
.rol-select:disabled { opacity: .5; cursor: not-allowed; }

/* Botones de acción */
.btn-accion {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: var(--r1);
  border: 1px solid var(--borde-fuerte);
  background: var(--panel);
  color: var(--texto-suave);
  font-size: var(--t-xs);
  font-family: var(--fuente);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transicion), color var(--transicion), border-color var(--transicion), opacity var(--transicion);
}
.btn-accion:disabled { opacity: .45; cursor: not-allowed; }
.btn-accion:not(:disabled):hover { background: var(--muted); color: var(--texto); }

.btn-accion--ok {
  color: var(--ok);
  border-color: var(--ok);
}
.btn-accion--ok:not(:disabled):hover { background: var(--ok-suave); }

.btn-accion--warn {
  color: var(--aviso);
  border-color: var(--aviso);
}
.btn-accion--warn:not(:disabled):hover { background: var(--aviso-suave); }

.btn-accion--danger {
  color: var(--error);
  border-color: var(--error);
}
.btn-accion--danger:not(:disabled):hover { background: var(--error-suave); }

.accion-spin { color: var(--texto-tenue); }

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: var(--t-xs);
  font-weight: 600;
  white-space: nowrap;
}

.badge--admin   { background: #FEF2F2; color: #B91C1C; }
.badge--editor  { background: #EFF6FF; color: #1D4ED8; }
.badge--lector  { background: #F1F5F9; color: #475569; }
.badge--sin-rol { background: #F8FAFC; color: #94A3B8; border: 1px dashed #CBD5E1; }

.badge--activo   { background: var(--ok-suave);    color: var(--ok); }
.badge--inactivo { background: var(--error-suave);  color: var(--error); }

.badge--bootstrap {
  background: color-mix(in srgb, var(--accent-suave) 80%, transparent);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.badge--yo {
  background: var(--simple-suave);
  color: var(--simple);
}

/* Dark theme overrides for badges */
:root[data-tema="oscuro"] .badge--admin   { background: #2A1113; color: #F87171; }
:root[data-tema="oscuro"] .badge--editor  { background: #1B2A4E; color: #93B4FF; }
:root[data-tema="oscuro"] .badge--lector  { background: #1A2436; color: #A9B6CA; }
:root[data-tema="oscuro"] .badge--sin-rol { background: #131C2E; color: #8494AB; border-color: #334155; }

/* Vacío */
.uv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--e3);
  padding: var(--e6) 0;
  color: var(--texto-tenue);
  font-size: var(--t-sm);
}

/* Spin animation */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }
</style>
