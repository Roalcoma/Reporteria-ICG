<template>
  <Teleport to="body">
    <div class="toasts-wrap" role="region" aria-live="polite" aria-label="Notificaciones">
      <TransitionGroup name="toast" tag="div" class="toasts-list">
        <div
          v-for="t in items"
          :key="t.id"
          class="toast"
          :class="`toast--${t.tipo}`"
          :role="t.tipo === 'error' ? 'alert' : 'status'"
        >
          <div class="toast-icono">
            <!-- ok -->
            <svg v-if="t.tipo === 'ok'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
            </svg>
            <!-- error -->
            <svg v-else-if="t.tipo === 'error'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            <!-- aviso -->
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>
            </svg>
          </div>

          <span class="toast-msg">{{ t.message }}</span>

          <button class="toast-cerrar" @click="store.remove(t.id)" aria-label="Cerrar notificación">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          <div class="toast-barra" :style="{ '--dur': t.duration + 'ms' }" />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { storeToRefs } from 'pinia';
import { useToastStore } from '@/stores/toasts.js';
const store = useToastStore();
const { items } = storeToRefs(store);
</script>

<style scoped>
.toasts-wrap {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9000;
  pointer-events: none;
}
.toasts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}

.toast {
  pointer-events: all;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 300px;
  max-width: 400px;
  padding: 14px 14px 14px 16px;
  background: var(--panel);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15,23,42,.14), 0 2px 8px rgba(15,23,42,.08);
  border: 1px solid var(--borde-fuerte);
  border-left: 4px solid;
  position: relative;
  overflow: hidden;
}

.toast--ok    { border-left-color: var(--ok); }
.toast--error { border-left-color: var(--error); }
.toast--aviso { border-left-color: var(--accent); }

.toast-icono {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.toast--ok    .toast-icono { color: var(--ok); }
.toast--error .toast-icono { color: var(--error); }
.toast--aviso .toast-icono { color: var(--accent); }

.toast-msg {
  flex: 1;
  font-size: var(--t-base);
  color: var(--texto);
  line-height: 1.4;
  word-break: break-word;
}

.toast-cerrar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--texto-tenue);
  cursor: pointer;
  border-radius: 6px;
  transition: background var(--transicion), color var(--transicion);
}
.toast-cerrar:hover { background: var(--muted); color: var(--texto); }

.toast-barra {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 3px;
  transform-origin: left center;
  animation: encogerse var(--dur, 4s) linear forwards;
}
.toast--ok    .toast-barra { background: var(--ok); }
.toast--error .toast-barra { background: var(--error); }
.toast--aviso .toast-barra { background: var(--accent); }

@keyframes encogerse {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* TransitionGroup animations */
.toast-enter-active { transition: transform 220ms cubic-bezier(0,.8,.3,1), opacity 220ms ease; }
.toast-leave-active { transition: transform 180ms ease-in, opacity 180ms ease-in; }
.toast-enter-from   { transform: translateX(110%); opacity: 0; }
.toast-leave-to     { transform: translateX(110%); opacity: 0; }
.toast-move         { transition: transform 200ms ease; }
</style>
