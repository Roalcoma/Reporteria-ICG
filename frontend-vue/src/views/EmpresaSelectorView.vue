<template>
  <div class="selector-page">
    <div class="selector-card panel">
      <h2 class="selector-titulo">Seleccionar empresa</h2>
      <p class="selector-sub">Elige la empresa de gestión para esta sesión.</p>

      <div v-if="loading" class="empty"><div class="spinner" /></div>
      <div v-else-if="error" class="empty" style="color:var(--error)">{{ error }}</div>
      <ul v-else class="empresa-lista">
        <li v-for="emp in empresas" :key="emp.codEmpresa">
          <button class="empresa-item" :class="{ activo: seleccionando === emp.codEmpresa }" @click="elegir(emp)">
            <div class="empresa-icono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3"/>
              </svg>
            </div>
            <div>
              <div class="empresa-nombre">{{ emp.nombre }}</div>
              <div class="empresa-tipo">{{ emp.tipoArea || 'Gestión' }}</div>
            </div>
            <span v-if="seleccionando === emp.codEmpresa" class="spinner" />
          </button>
        </li>
      </ul>

      <button class="btn btn-ghost" @click="logout">Cerrar sesión</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session.js';

const router      = useRouter();
const session     = useSessionStore();
const empresas    = ref([]);
const loading     = ref(true);
const error       = ref('');
const seleccionando = ref(null);

onMounted(async () => {
  try {
    empresas.value = session.empresas.length
      ? session.empresas
      : await import('@/api.js').then(m => m.api.empresas('GESTION'));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function elegir(emp) {
  seleccionando.value = emp.codEmpresa;
  try {
    await session.setEmpresa(emp.codEmpresa);
    router.push('/reportes');
  } catch (e) {
    error.value = e.message;
    seleccionando.value = null;
  }
}

async function logout() {
  await session.logout();
  router.push('/login');
}
</script>

<style scoped>
.selector-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fondo);
}
.selector-card {
  width: 440px;
  padding: var(--e6);
  display: flex;
  flex-direction: column;
  gap: var(--e4);
}
.selector-titulo { font-size: var(--t-xl); font-weight: 700; color: var(--titulo); }
.selector-sub    { font-size: var(--t-base); color: var(--texto-tenue); }

.empresa-lista {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--e2);
  max-height: 340px;
  overflow-y: auto;
}
.empresa-item {
  display: flex;
  align-items: center;
  gap: var(--e3);
  width: 100%;
  padding: var(--e3) var(--e4);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r3);
  background: var(--panel);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--transicion), background var(--transicion);
}
.empresa-item:hover { border-color: var(--primary); background: var(--panel-alt); }
.empresa-item.activo { border-color: var(--primary); background: #EFF6FF; }
.empresa-icono {
  width: 36px; height: 36px;
  border-radius: var(--r2);
  background: var(--simple-suave);
  color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.empresa-nombre { font-size: var(--t-md); font-weight: 600; color: var(--texto); }
.empresa-tipo   { font-size: var(--t-sm); color: var(--texto-tenue); }
.empresa-item .spinner { margin-left: auto; }
</style>
