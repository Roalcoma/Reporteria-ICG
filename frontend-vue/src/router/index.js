import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '@/stores/session.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/empresas', component: () => import('@/views/EmpresaSelectorView.vue'), meta: { requiresAuth: true } },
    {
      path: '/',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true, requiresEmpresa: true },
      children: [
        { path: '',        redirect: '/reportes' },
        { path: 'reportes',       component: () => import('@/views/ReportesView.vue') },
        { path: 'dashboards',     component: () => import('@/views/DashboardsView.vue') },
        { path: 'programaciones', component: () => import('@/views/ProgramacionesView.vue'), meta: { requierePermiso: 'PuedeProgramar' } },
        { path: 'auditoria',      component: () => import('@/views/AuditoriaView.vue'),      meta: { requierePermiso: 'PuedeProgramar' } },
        { path: 'procedimientos', component: () => import('@/views/ProcedimientosView.vue'), meta: { requierePermiso: 'PuedeProgramar' } },
        { path: 'branding',       component: () => import('@/views/BrandingView.vue'),       meta: { requierePermiso: 'PuedeAdministrar' } },
        { path: 'portabilidad',   component: () => import('@/views/PortabilidadView.vue'),   meta: { requierePermiso: 'PuedeAdministrar' } },
        { path: 'usuarios',       component: () => import('@/views/UsuariosView.vue'),       meta: { requierePermiso: 'PuedeAdministrar' } },
        { path: 'perfiles',       component: () => import('@/views/PerfilesView.vue'),       meta: { requierePermiso: 'PuedeAdministrar' } },
        { path: 'actualizacion',  component: () => import('@/views/ActualizacionView.vue'),  meta: { requierePermiso: 'PuedeAdministrar' } },
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

router.beforeEach(async (to) => {
  const session = useSessionStore();

  if (!session.user && !to.meta.public) {
    try { await session.fetchMe(); } catch { /* not authenticated */ }
  }

  if (!to.meta.public && !session.user) return '/login';
  if (to.meta.requiresEmpresa && !session.empresaGestion) return '/empresas';
  if (to.path === '/login' && session.user) {
    return session.empresaGestion ? '/' : '/empresas';
  }
  if (to.meta.requierePermiso && !session.user?.permisos?.[to.meta.requierePermiso]) {
    return '/';
  }
});

export default router;
