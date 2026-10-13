<template>
  <nav class="app-sidebar" :class="{ collapsed }">
    <!-- Logo / título -->
    <div class="sb-header">
      <img v-if="!collapsed" src="@/assets/LOGO/1.png" alt="Redes IP" class="sb-logo" />
      <span v-else class="sb-logo-abbr">ri</span>
    </div>

    <!-- Empresa activa -->
    <button v-if="!collapsed && empresaGestion" class="sb-empresa" @click="cambiarEmpresa">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3"/>
      </svg>
      <span>{{ empresaGestion.nombre }}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="sb-empresa-chevron">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </button>

    <!-- Navegación -->
    <div class="sb-nav">
      <RouterLink v-for="item in navItems" :key="item.to"
        :to="item.to"
        class="sb-item"
        active-class="sb-item--active"
        :title="collapsed ? item.label : undefined"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
          v-html="item.icon"
        />
        <span v-if="!collapsed" class="sb-item-label">{{ item.label }}</span>
      </RouterLink>
    </div>

    <!-- Footer: usuario + logout -->
    <div class="sb-footer">
      <button class="sb-collapse-btn" @click="collapsed = !collapsed" :title="collapsed ? 'Expandir' : 'Colapsar'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path v-if="!collapsed" d="M15 18l-6-6 6-6"/>
          <path v-else d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      <div v-if="!collapsed" class="sb-user">
        <div class="sb-avatar">{{ iniciales }}</div>
        <div class="sb-user-info">
          <span class="sb-user-name">{{ user?.usuario }}</span>
          <span class="sb-user-rol">{{ user?.rol }}</span>
        </div>
        <button class="sb-logout-btn" @click="logout" title="Cerrar sesión">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session.js';

const session = useSessionStore();
const router  = useRouter();
const collapsed = ref(false);

const user           = computed(() => session.user);
const empresaGestion = computed(() => session.empresaGestion);
const iniciales      = computed(() =>
  (user.value?.usuario || 'U').slice(0, 2).toUpperCase()
);

async function logout() {
  await session.logout();
  router.push('/login');
}

function cambiarEmpresa() {
  session.empresaGestion = null;
  router.push('/empresas');
}

const navItems = computed(() => {
  const p = user.value?.permisos || {};
  const items = [
    { to: '/reportes',   label: 'Reportes',   icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>' },
    { to: '/dashboards', label: 'Dashboards', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  ];
  // Supervisor: puede programar y auditar
  if (p.PuedeProgramar || p.PuedeAdministrar) {
    items.push(
      { to: '/programaciones', label: 'Programaciones', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>' },
      { to: '/auditoria',      label: 'Auditoría',      icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
    );
  }
  // Administrador: gestión completa (Procedimientos ve y altera código del ERP)
  if (p.PuedeAdministrar) {
    items.push(
      { to: '/procedimientos', label: 'Procedimientos', icon: '<path d="M4 7l8-4 8 4v6c0 5-8 9-8 9S4 18 4 13V7z"/><path d="M8 11l3 3 5-5"/>' },
      { to: '/branding',     label: 'Branding',     icon: '<circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/><path d="M2 12h20"/>' },
      { to: '/portabilidad', label: 'Portabilidad', icon: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>' },
      { to: '/usuarios',     label: 'Usuarios',     icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>' },
      { to: '/perfiles',     label: 'Perfiles',     icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>' },
      { to: '/actualizacion', label: 'Actualización', icon: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>' },
    );
  }
  return items;
});
</script>

<style scoped>
.app-sidebar {
  width: var(--sidebar-ancho);
  transition: width var(--transicion-lenta);
}
.app-sidebar.collapsed {
  width: 56px;
}

.sb-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--e3) var(--e3);
  border-bottom: 1px solid var(--sidebar-borde);
  min-height: var(--header-alto);
}
.sb-logo {
  height: 36px;
  width: auto;
  max-width: 180px;
  object-fit: contain;
}
.sb-logo-abbr {
  font-size: var(--t-md);
  font-weight: 800;
  color: #86BB25;
  letter-spacing: -.02em;
}

.sb-empresa {
  display: flex;
  align-items: center;
  gap: var(--e2);
  margin: var(--e2) var(--e2);
  padding: 6px var(--e2);
  border-radius: var(--r2);
  border: 1px solid var(--sidebar-borde);
  background: rgba(255,255,255,.04);
  color: var(--sidebar-texto);
  font-size: var(--t-sm);
  cursor: pointer;
  text-align: left;
  transition: background var(--transicion), color var(--transicion);
  width: calc(100% - 16px);
  overflow: hidden;
}
.sb-empresa span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-empresa:hover { background: rgba(255,255,255,.08); color: var(--sidebar-texto-hover); }
.sb-empresa-chevron { flex-shrink: 0; }

.sb-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--e2) var(--e2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-item {
  display: flex;
  align-items: center;
  gap: var(--e3);
  padding: 8px var(--e3);
  border-radius: var(--r2);
  color: var(--sidebar-texto);
  text-decoration: none;
  font-size: var(--t-base);
  font-weight: 500;
  transition: background var(--transicion), color var(--transicion);
  white-space: nowrap;
  overflow: hidden;
  position: relative;
}
.sb-item:hover {
  background: rgba(255,255,255,.06);
  color: var(--sidebar-texto-hover);
}
.sb-item--active {
  background: var(--sidebar-activo-bg);
  color: var(--sidebar-activo-txt);
}
.sb-item--active::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--sidebar-activo-bar);
}
.sb-item svg { flex-shrink: 0; }
.sb-item-label { overflow: hidden; text-overflow: ellipsis; }

.sb-footer {
  border-top: 1px solid var(--sidebar-borde);
  padding: var(--e2) var(--e2);
  display: flex;
  flex-direction: column;
  gap: var(--e2);
}

.sb-collapse-btn {
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: var(--r2);
  border: 1px solid var(--sidebar-borde);
  background: transparent;
  color: var(--sidebar-texto);
  cursor: pointer;
  transition: background var(--transicion), color var(--transicion);
}
.sb-collapse-btn:hover { background: rgba(255,255,255,.08); color: var(--sidebar-texto-hover); }

.sb-user {
  display: flex;
  align-items: center;
  gap: var(--e2);
}
.sb-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: var(--t-sm);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sb-user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.sb-user-name {
  font-size: var(--t-sm);
  font-weight: 600;
  color: #CBD5E1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-user-rol {
  font-size: var(--t-xs);
  color: var(--sidebar-texto);
}
.sb-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: var(--r2);
  border: none;
  background: transparent;
  color: var(--sidebar-texto);
  cursor: pointer;
  transition: color var(--transicion);
  flex-shrink: 0;
}
.sb-logout-btn:hover { color: var(--error); }
</style>
