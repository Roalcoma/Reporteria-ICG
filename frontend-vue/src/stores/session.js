import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api.js';

export const useSessionStore = defineStore('session', () => {
  const user = ref(null);           // { usuario, codUsuario, rol, permisos }
  const empresaGestion = ref(null); // { codEmpresa, nombre }
  const empresas = ref([]);

  const isAdmin = computed(() =>
    user.value?.permisos?.PuedeAdministrar === true
  );
  const isSupervisor = computed(() =>
    user.value?.permisos?.PuedeProgramar === true || isAdmin.value
  );

  async function login(password) {
    const data = await api.login(password);
    user.value = { usuario: data.usuario, codUsuario: data.codUsuario, rol: data.rol, permisos: data.permisos };
    empresas.value = data.empresas || [];
    // auto-select if only one empresa
    if (empresas.value.length === 1) {
      await setEmpresa(empresas.value[0].codEmpresa);
    }
    return data;
  }

  async function logout() {
    await api.logout().catch(() => {});
    user.value = null;
    empresaGestion.value = null;
    empresas.value = [];
  }

  async function fetchMe() {
    const data = await api.me();
    user.value = { usuario: data.usuario, codUsuario: data.codUsuario, rol: data.rol, permisos: data.permisos };
    empresaGestion.value = data.empresaGestion || null;
    if (!empresas.value.length) {
      empresas.value = await api.empresas('GESTION').catch(() => []);
    }
  }

  async function setEmpresa(codEmpresa) {
    const emp = await api.fijarEmpresa(codEmpresa);
    empresaGestion.value = emp;
  }

  return { user, empresaGestion, empresas, isAdmin, isSupervisor, login, logout, fetchMe, setEmpresa };
});
