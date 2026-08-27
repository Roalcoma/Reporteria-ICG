<template>
  <div class="sql-editor" ref="host" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';

const props = defineProps({
  modelValue: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  minHeight: { type: String, default: '200px' },
});
const emit = defineEmits(['update:modelValue']);

const host = ref(null);
let view = null;

onMounted(() => {
  view = new EditorView({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      sql(),
      oneDark,
      EditorView.lineWrapping,
      EditorView.editable.of(!props.readonly),
      EditorView.updateListener.of(u => {
        if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
      }),
    ],
    parent: host.value,
  });
});

watch(() => props.modelValue, val => {
  if (!view) return;
  const cur = view.state.doc.toString();
  if (cur !== val) view.dispatch({ changes: { from: 0, to: cur.length, insert: val } });
});

watch(() => props.readonly, val => {
  view?.dispatch({ effects: EditorView.editable.reconfigure(!val) });
});

onBeforeUnmount(() => { view?.destroy(); view = null; });
</script>

<style scoped>
.sql-editor { height: 100%; overflow: hidden; border-radius: var(--radio); }
.sql-editor :deep(.cm-editor) {
  height: 100%;
  min-height: v-bind(minHeight);
  font-size: 13px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}
.sql-editor :deep(.cm-scroller) { overflow: auto; }
</style>
