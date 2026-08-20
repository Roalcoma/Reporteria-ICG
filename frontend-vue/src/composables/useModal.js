import { useModalStore } from '@/stores/modal.js';

export function useModal() {
  const store = useModalStore();
  return {
    confirm: (title, message, { danger = false } = {}) =>
      store.open({ type: 'confirm', title, message, danger }),

    prompt: (title, { placeholder = '', defaultValue = '', label = '' } = {}) =>
      store.open({ type: 'input', title, placeholder, defaultValue, label }),
  };
}
