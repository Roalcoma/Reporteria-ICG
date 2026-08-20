import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToastStore = defineStore('toasts', () => {
  const items = ref([]);
  let _id = 0;

  function add(message, tipo = 'ok', duration = 4000) {
    const id = ++_id;
    items.value.push({ id, message, tipo, duration });
    setTimeout(() => remove(id), duration);
  }

  function remove(id) {
    items.value = items.value.filter(t => t.id !== id);
  }

  return { items, add, remove };
});
