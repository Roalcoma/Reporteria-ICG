import { useRef, useEffect } from 'react';
import Editor, { loader } from '@monaco-editor/react';
// Core del editor + registro de gramaticas basicas. Monaco 0.56 carga cada
// gramatica en un chunk aparte bajo demanda, asi que solo se descarga SQL.
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/basic-languages/monaco.contribution.js';
// Monaco 0.56 expone los workers vía "exports": la ruta se resuelve a esm/vs/*.
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';

/**
 * Editor T-SQL con resaltado de sintaxis y realce visual de las variables
 * {PARAMETRO}.
 *
 * IMPORTANTE: @monaco-editor/react descarga Monaco de un CDN por defecto.
 * Aquí se fuerza el paquete LOCAL para que funcione en servidores on-premise
 * sin salida a internet (caso habitual en instalaciones ICG).
 */
self.MonacoEnvironment = { getWorker: () => new editorWorker() };
loader.config({ monaco });

const TOKEN_RE = /\{[A-Z0-9_]+\}/g;

export default function SqlEditor({ value, onChange, altura = 260, soloLectura = false }) {
  const editorRef = useRef(null);
  const decoracionesRef = useRef([]);

  /** Subraya cada {PARAMETRO} presente en el texto. */
  const marcarParametros = (editor) => {
    const model = editor.getModel();
    if (!model) return;
    const nuevas = [];
    for (let ln = 1; ln <= model.getLineCount(); ln++) {
      const texto = model.getLineContent(ln);
      let m;
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(texto)) !== null) {
        nuevas.push({
          range: new monaco.Range(ln, m.index + 1, ln, m.index + 1 + m[0].length),
          options: { inlineClassName: 'sql-param', hoverMessage: { value: 'Parámetro del reporte' } }
        });
      }
    }
    decoracionesRef.current = editor.deltaDecorations(decoracionesRef.current, nuevas);
  };

  const onMount = (editor) => {
    editorRef.current = editor;
    marcarParametros(editor);
  };

  useEffect(() => {
    if (editorRef.current) marcarParametros(editorRef.current);
  }, [value]);

  return (
    <div className="sql-editor">
      <Editor
        height={altura}
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange && onChange(v ?? '')}
        onMount={onMount}
        options={{
          readOnly: soloLectura,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2
        }}
      />
    </div>
  );
}

/** Extrae los tokens {PARAM} únicos de un SQL (para sugerir parámetros a definir). */
export function extraerParametros(sqlText) {
  const encontrados = new Set();
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(sqlText || '')) !== null) {
    encontrados.add(m[0].slice(1, -1));
  }
  return [...encontrados];
}
