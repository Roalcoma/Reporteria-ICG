import { useToastStore } from '@/stores/toasts.js';

export function useToast() {
  const store = useToastStore();
  return {
    ok:    (msg) => store.add(msg, 'ok'),
    error: (msg) => store.add(msg, 'error'),
    aviso: (msg) => store.add(msg, 'aviso'),
  };
}
