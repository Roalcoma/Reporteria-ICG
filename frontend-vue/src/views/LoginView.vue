<template>
  <div class="login-page">
    <div class="login-card panel">
      <div class="login-logo">
        <img src="@/assets/LOGO/5.png" alt="Redes IP" class="login-logo-img" />
        <h1>ICG Reportería</h1>
      </div>

      <form @submit.prevent="submit" class="login-form">
        <div class="campo">
          <label for="pwd">Contraseña ICG</label>
          <input
            id="pwd"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="loading"
            required
          />
          <span v-if="error" class="error-msg">{{ error }}</span>
        </div>

        <button type="submit" class="btn btn-primary login-btn" :disabled="loading || !password">
          <span v-if="loading" class="spinner" />
          <span>{{ loading ? 'Verificando…' : 'Ingresar' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session.js';

const router   = useRouter();
const session  = useSessionStore();
const password = ref('');
const error    = ref('');
const loading  = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const data = await session.login(password.value);
    if (data.empresas?.length === 1) {
      router.push('/reportes');
    } else {
      router.push('/empresas');
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fondo);
}
.login-card {
  width: 360px;
  padding: var(--e6);
  display: flex;
  flex-direction: column;
  gap: var(--e5);
}
.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--e2);
}
.login-logo-img {
  height: 52px;
  width: auto;
  object-fit: contain;
}
.login-logo h1 {
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--texto-suave);
  letter-spacing: .02em;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--e4);
}
.login-btn { width: 100%; justify-content: center; padding: 10px; }
</style>
