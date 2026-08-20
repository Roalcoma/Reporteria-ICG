import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useModalStore = defineStore('modal', () => {
  const state = ref(null);
  // state = { type:'confirm'|'input', title, message, placeholder, defaultValue, danger, resolve }

  function open(opts) {
    return new Promise((resolve) => {
      state.value = { ...opts, resolve };
    });
  }

  function close(value) {
    state.value?.resolve(value);
    state.value = null;
  }

  return { state, open, close };
});
