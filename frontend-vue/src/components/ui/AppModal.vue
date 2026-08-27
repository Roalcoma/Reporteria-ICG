<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="ms.state" class="modal-backdrop" @click.self="cancelar" @keydown.esc="cancelar">
        <div
          class="modal-card"
          role="dialog"
          :aria-modal="true"
          :aria-labelledby="'modal-title'"
          tabindex="-1"
          ref="cardRef"
        >
          <!-- Ícono -->
          <div class="modal-icono" :class="ms.state.danger ? 'modal-icono--peligro' : 'modal-icono--info'">
            <!-- peligro / confirmar destructivo -->
            <svg v-if="ms.state.danger" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <!-- confirmar neutro -->
            <svg v-else-if="ms.state.type === 'confirm'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <!-- input / editar -->
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>
            </svg>
          </div>

          <!-- Título -->
          <h3 id="modal-title" class="modal-titulo">{{ ms.state.title }}</h3>

          <!-- Mensaje (solo confirm) -->
          <p v-if="ms.state.type === 'confirm' && ms.state.message" class="modal-mensaje">
            {{ ms.state.message }}
          </p>

          <!-- Input (solo input) -->
          <div v-if="ms.state.type === 'input'" class="campo">
            <label v-if="ms.state.label" for="modal-input">{{ ms.state.label }}</label>
            <input
              id="modal-input"
              ref="inputRef"
              v-model="valorInput"
              type="text"
              :placeholder="ms.state.placeholder"
              class="modal-input"
              @keydown.enter="confirmar"
              @keydown.esc="cancelar"
            />
          </div>

          <!-- Acciones -->
          <div class="modal-acciones">
            <button class="btn btn-ghost" @click="cancelar">Cancelar</button>
            <button
              class="btn"
              :class="ms.state.danger ? 'btn-danger-solid' : 'btn-primary'"
              @click="confirmar"
              :disabled="ms.state.type === 'input' && !valorInput.trim()"
            >
              {{ ms.state.danger ? 'Eliminar' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useModalStore } from '@/stores/modal.js';

const ms = useModalStore();

const cardRef    = ref(null);
const inputRef   = ref(null);
const valorInput = ref('');

watch(() => ms.state, async (s) => {
  if (!s) return;
  valorInput.value = s.defaultValue || '';
  await nextTick();
  if (s.type === 'input') inputRef.value?.focus();
  else cardRef.value?.focus();
});

function confirmar() {
  if (ms.state?.type === 'input') {
    if (!valorInput.value.trim()) return;
    ms.close(valorInput.value.trim());
  } else {
    ms.close(true);
  }
}

function cancelar() {
  ms.close(null);
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
  padding: 16px;
}

.modal-card {
  background: var(--panel);
  border-radius: 16px;
  padding: 28px 28px 24px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 24px 64px rgba(15,23,42,.22), 0 4px 16px rgba(15,23,42,.10);
  display: flex;
  flex-direction: column;
  gap: 12px;
  outline: none;
}

.modal-icono {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.modal-icono--info   { background: #EFF6FF; color: var(--primary); }
.modal-icono--peligro { background: var(--error-suave); color: var(--error); }

.modal-titulo {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--texto);
  line-height: 1.3;
}

.modal-mensaje {
  font-size: var(--t-base);
  color: var(--texto-suave);
  line-height: 1.5;
}

.modal-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--borde-fuerte);
  border-radius: var(--r2);
  background: var(--panel-alt);
  color: var(--texto);
  font-size: var(--t-md);
  font-family: var(--fuente);
  transition: border-color var(--transicion), box-shadow var(--transicion);
}
.modal-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(30,64,175,.12);
}

.modal-acciones {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-danger-solid {
  background: var(--error);
  color: #fff;
  border-color: var(--error);
}
.btn-danger-solid:hover:not(:disabled) { background: #991B1B; border-color: #991B1B; }

/* Transition */
.modal-enter-active { transition: opacity 200ms ease; }
.modal-leave-active { transition: opacity 160ms ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.modal-enter-active .modal-card {
  animation: cardEntrar 220ms cubic-bezier(0.34,1.56,0.64,1) both;
}
.modal-leave-active .modal-card {
  animation: cardSalir 160ms ease-in both;
}

@keyframes cardEntrar {
  from { transform: scale(0.93) translateY(12px); opacity: 0; }
  to   { transform: scale(1)    translateY(0);    opacity: 1; }
}
@keyframes cardSalir {
  from { transform: scale(1)    translateY(0);    opacity: 1; }
  to   { transform: scale(0.95) translateY(8px);  opacity: 0; }
}
</style>
