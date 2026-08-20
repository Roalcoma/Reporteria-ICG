<template>
  <div class="grid-wrap" @click="closeMenu">
    <div v-if="!rows.length" class="empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>
      </svg>
      <span>Sin resultados</span>
    </div>

    <template v-else>
      <!-- Meta -->
      <div class="grid-meta">
        {{ rows.length }} fila{{ rows.length === 1 ? '' : 's' }}
        <span v-if="groupByCol" class="grid-info"> · agrupado por <strong>{{ colLabel(groupByCol) }}</strong> ({{ sortedGroups.length }} grupos)</span>
        <span v-else-if="table.getPageCount() > 1" class="grid-info"> — página {{ pageIndex + 1 }} de {{ table.getPageCount() }}</span>
      </div>

      <!-- Table -->
      <div class="grid-container" ref="scrollEl">
        <table>
          <thead>
            <tr>
              <th v-if="groupByCol" class="th-toggle"></th>
              <th
                v-for="col in effectiveCols" :key="col.id"
                :class="{ sortable: !groupByCol, num: esNum(col.formato) }"
                :draggable="true"
                @dragstart.stop="dragStart(col.id)"
                @dragover.prevent
                @drop.stop="dragDrop(col.id)"
                @click="!groupByCol && toggleSort(col.id)"
              >
                <div class="th-inner">
                  <span class="th-label">
                    {{ col.label }}
                    <template v-if="!groupByCol && sortCol === col.id">{{ sortDir === 'asc' ? ' ↑' : ' ↓' }}</template>
                  </span>
                  <span v-if="colAggs[col.id]" class="agg-badge" :title="colAggs[col.id]">Σ</span>
                  <button class="th-btn" @click.stop="openMenuFor(col.id, $event)" title="Opciones de columna">⋮</button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- GROUPED -->
            <template v-if="groupByCol">
              <template v-for="grp in sortedGroups" :key="grp.key">
                <!-- Header de grupo — abarca todas las columnas -->
                <tr class="grp-hdr" @click="toggleExpand(grp.key)">
                  <td class="grp-toggle-cell">{{ expandedGroups.has(grp.key) ? '▼' : '▶' }}</td>
                  <td :colspan="effectiveCols.length" class="grp-title">
                    <strong>{{ colLabel(groupByCol) }}:</strong>&nbsp;{{ grp.key || '(vacío)' }}
                    <span class="grp-count">({{ grp.rows.length }})</span>
                  </td>
                </tr>
                <!-- Filas del grupo -->
                <template v-if="expandedGroups.has(grp.key)">
                  <tr v-for="(row, i) in grp.rows" :key="grp.key + '_' + i"
                      class="grp-leaf" :class="{ alt: i % 2 === 1 }">
                    <td class="grp-indent"></td>
                    <td v-for="col in effectiveCols" :key="col.id" :class="{ num: esNum(col.formato) }">
                      {{ fmtCell(row[col.id], col) }}
                    </td>
                  </tr>
                  <!-- Subtotal al pie del grupo -->
                  <tr v-if="hayTotales" class="grp-subtotal-row">
                    <td class="grp-subtotal-indent"></td>
                    <td v-for="col in effectiveCols" :key="col.id" :class="{ num: esNum(col.formato) }">
                      {{ colAggs[col.id] ? fmtAgg(grp.rows, col) : '' }}
                    </td>
                  </tr>
                </template>
              </template>
            </template>

            <!-- FLAT (TanStack paginado) -->
            <template v-else>
              <tr v-for="row in table.getRowModel().rows" :key="row.id" :class="{ alt: row.index % 2 === 1 }">
                <td v-for="cell in row.getVisibleCells()" :key="cell.id"
                    :class="{ num: esNum(cell.column.columnDef.meta?.formato) }">
                  {{ fmtCell(cell.getValue(), cell.column.columnDef.meta) }}
                </td>
              </tr>
            </template>
          </tbody>

          <!-- Totales -->
          <tfoot v-if="hayTotales">
            <tr>
              <td v-if="groupByCol"></td>
              <td v-for="col in effectiveCols" :key="col.id" :class="{ num: esNum(col.formato) }">
                {{ colAggs[col.id] ? fmtAgg(rows, col) : '' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Paginación (solo flat) -->
      <div v-if="!groupByCol && table.getPageCount() > 1" class="grid-pag">
        <button class="pag-btn" :disabled="!table.getCanPreviousPage()" @click="table.previousPage()">← Anterior</button>
        <span class="pag-label">{{ pageIndex + 1 }} / {{ table.getPageCount() }}</span>
        <button class="pag-btn" :disabled="!table.getCanNextPage()" @click="table.nextPage()">Siguiente →</button>
      </div>
    </template>

    <!-- Menú de columna (flotante) -->
    <Teleport to="body">
      <div v-if="menu.open" class="col-menu" :style="menuStyle" @click.stop>
        <div class="col-menu-title">
          <template v-if="menu.renaming">
            <input ref="renameInput" v-model="menu.alias" class="col-rename-input"
              placeholder="Nombre visual..."
              @keydown.enter="applyRename" @keydown.escape="menu.renaming = false" />
            <button class="col-menu-apply" @click="applyRename">✓</button>
          </template>
          <template v-else>
            <span>{{ colLabel(menu.colId) }}</span>
            <button class="col-menu-icon" @click="startRename" title="Renombrar">✏️</button>
          </template>
        </div>
        <div class="col-menu-sep"></div>
        <button class="col-menu-item" @click="moveLeft">← Mover izquierda</button>
        <button class="col-menu-item" @click="moveRight">→ Mover derecha</button>
        <div class="col-menu-sep"></div>
        <div class="col-menu-section">Totalizar</div>
        <button v-for="fn in AGG_FNS" :key="String(fn.v)"
          class="col-menu-item" :class="{ active: colAggs[menu.colId] === fn.v }"
          @click="setAgg(fn.v)">{{ fn.label }}</button>
        <div class="col-menu-sep"></div>
        <button class="col-menu-item" :class="{ active: groupByCol === menu.colId }" @click="toggleGroupBy">
          {{ groupByCol === menu.colId ? '✓ Quitar agrupación' : '⊞ Agrupar por esta columna' }}
        </button>
        <div class="col-menu-sep"></div>
        <div class="col-menu-section">Formato</div>
        <div class="col-menu-row">
          <select class="col-menu-select" v-model="menu.formato" @change="applyFormato">
            <option value="TEXTO">Texto</option>
            <option value="FECHA">Fecha / Hora</option>
            <option value="ENTERO">Entero</option>
            <option value="NUMERO">Número</option>
            <option value="MONEDA">Moneda</option>
            <option value="PORCENTAJE">%</option>
          </select>
        </div>
        <div v-if="menu.formato === 'FECHA'" class="col-menu-row">
          <input class="col-menu-patron" v-model="menu.patron" @change="applyPatron"
            placeholder="dd/MM/yyyy HH:mm"
            title="Tokens: dd día · MM mes · yyyy año · HH hora 24h · mm minutos · ss segundos" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useVueTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel } from '@tanstack/vue-table';
import { formatValue, esNumerico, calcularAgregacion } from '@/format.js';

const PAGE_SIZE = 500;

const AGG_FNS = [
  { v: 'SUMA',     label: 'Σ Suma' },
  { v: 'PROMEDIO', label: 'x̄ Promedio' },
  { v: 'CONTEO',   label: '# Conteo' },
  { v: 'MIN',      label: '↓ Mínimo' },
  { v: 'MAX',      label: '↑ Máximo' },
  { v: null,       label: '✕ Ninguno' },
];

const props = defineProps({
  rows:     { type: Array, default: () => [] },
  columnas: { type: Array, default: () => [] }
});

// ── state ──────────────────────────────────────────────
const sorting        = ref([]);
const pageIndex      = ref(0);
const columnOrder    = ref([]);
const colAliases     = ref({});
const colAggs        = ref({});
const colFormatos    = ref({});
const colPatrones    = ref({});
const groupByCol     = ref(null);
const expandedGroups = ref(new Set());
const draggedColId   = ref(null);
const scrollEl       = ref(null);
const renameInput    = ref(null);
const menu           = ref({ open: false, colId: null, x: 0, y: 0, renaming: false, alias: '', formato: 'TEXTO', patron: '' });

// ── columnas ───────────────────────────────────────────
const baseCols = computed(() => {
  const visibles = props.columnas.filter(c => c.VisiblePorDefecto !== false);
  if (visibles.length) {
    return visibles.map(c => ({
      id: c.NombreCampo, label: c.AliasVisible || c.NombreCampo,
      formato: c.Formato, patron: c.FormatoPatron
    }));
  }
  return Object.keys(props.rows[0] || {}).map(k => ({ id: k, label: k, formato: 'TEXTO', patron: null }));
});

// Al cambiar el conjunto de columnas (nuevo reporte), reiniciar orden y customizaciones
watch(baseCols, (cols) => {
  columnOrder.value    = cols.map(c => c.id);
  colAliases.value     = {};
  colAggs.value        = {};
  colFormatos.value    = {};
  colPatrones.value    = {};
  groupByCol.value     = null;
  expandedGroups.value = new Set();
}, { immediate: true });

const effectiveCols = computed(() => {
  const ordered = columnOrder.value
    .map(id => baseCols.value.find(c => c.id === id))
    .filter(Boolean);
  const rest = baseCols.value.filter(c => !columnOrder.value.includes(c.id));
  return [...ordered, ...rest].map(col => ({
    ...col,
    label:   colAliases.value[col.id]  ?? col.label,
    formato: colFormatos.value[col.id] ?? col.formato,
    patron:  colPatrones.value[col.id] ?? col.patron,
  }));
});

const columnDefs = computed(() =>
  effectiveCols.value.map(col => ({
    id: col.id, accessorKey: col.id, header: col.label,
    enableSorting: true,
    meta: { formato: col.formato, patron: col.patron }
  }))
);

// ── tabla TanStack (vista flat) ────────────────────────
const table = useVueTable({
  get data()    { return props.rows; },
  get columns() { return columnDefs.value; },
  state: {
    get sorting()    { return sorting.value; },
    get pagination() { return { pageIndex: pageIndex.value, pageSize: PAGE_SIZE }; }
  },
  onSortingChange: (u) => {
    sorting.value  = typeof u === 'function' ? u(sorting.value) : u;
    pageIndex.value = 0;
  },
  onPaginationChange: (u) => {
    const next = typeof u === 'function' ? u({ pageIndex: pageIndex.value, pageSize: PAGE_SIZE }) : u;
    pageIndex.value = next.pageIndex;
  },
  getCoreRowModel:       getCoreRowModel(),
  getSortedRowModel:     getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel()
});

// ── orden y sort (flat) ────────────────────────────────
const sortCol = computed(() => sorting.value[0]?.id ?? null);
const sortDir = computed(() => sorting.value[0]?.desc ? 'desc' : 'asc');
function toggleSort(colId) {
  sorting.value  = sortCol.value === colId
    ? [{ id: colId, desc: !sorting.value[0].desc }]
    : [{ id: colId, desc: false }];
  pageIndex.value = 0;
}

// ── drag & drop ────────────────────────────────────────
function dragStart(id)   { draggedColId.value = id; }
function dragDrop(toId) {
  if (!draggedColId.value || draggedColId.value === toId) return;
  const order = [...columnOrder.value];
  const from  = order.indexOf(draggedColId.value);
  const to    = order.indexOf(toId);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedColId.value);
  columnOrder.value  = order;
  draggedColId.value = null;
}

// ── agrupación ─────────────────────────────────────────
const grouped = computed(() => {
  if (!groupByCol.value) return null;
  const map = new Map();
  for (const row of props.rows) {
    const key = String(row[groupByCol.value] ?? '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return Array.from(map.entries()).map(([key, rows]) => ({ key, rows }));
});

const sortedGroups = computed(() => {
  if (!grouped.value) return [];
  return [...grouped.value].sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true }));
});

function toggleExpand(key) {
  const s = new Set(expandedGroups.value);
  s.has(key) ? s.delete(key) : s.add(key);
  expandedGroups.value = s;
}

// ── totales ────────────────────────────────────────────
const hayTotales = computed(() => Object.values(colAggs.value).some(Boolean));

function fmtAgg(rows, col) {
  const tipo = colAggs.value[col.id];
  if (!tipo) return '';
  const v = calcularAgregacion(rows, col.id, tipo);
  return v !== null ? formatValue(v, col.formato, col.patron) : '';
}

// ── formato de celda ───────────────────────────────────
const esNum = (fmt) => esNumerico(fmt || '');
function fmtCell(valor, meta) {
  return formatValue(valor, (meta?.formato ?? meta?.formato) || 'TEXTO', meta?.patron ?? meta?.patron);
}

// ── menú de columna ────────────────────────────────────
function colLabel(id) {
  return effectiveCols.value.find(c => c.id === id)?.label ?? id ?? '';
}

const menuStyle = computed(() => ({ position: 'fixed', top: menu.value.y + 'px', left: menu.value.x + 'px' }));

function openMenuFor(colId, e) {
  const rect = e.target.getBoundingClientRect();
  const col  = effectiveCols.value.find(c => c.id === colId);
  menu.value = {
    open: true, colId, x: rect.left, y: rect.bottom + 4, renaming: false,
    alias: colLabel(colId),
    formato: col?.formato || 'TEXTO',
    patron:  col?.patron  || ''
  };
}
function closeMenu() { menu.value.open = false; }

function startRename() {
  menu.value.renaming = true;
  menu.value.alias    = colLabel(menu.value.colId);
  nextTick(() => renameInput.value?.focus());
}
function applyRename() {
  const v = menu.value.alias.trim();
  if (v) colAliases.value = { ...colAliases.value, [menu.value.colId]: v };
  menu.value.renaming = false;
}

function moveLeft() {
  const order = [...columnOrder.value];
  const i = order.indexOf(menu.value.colId);
  if (i > 0) [order[i - 1], order[i]] = [order[i], order[i - 1]];
  columnOrder.value = order;
  closeMenu();
}
function moveRight() {
  const order = [...columnOrder.value];
  const i = order.indexOf(menu.value.colId);
  if (i < order.length - 1) [order[i], order[i + 1]] = [order[i + 1], order[i]];
  columnOrder.value = order;
  closeMenu();
}
function setAgg(tipo) {
  const a = { ...colAggs.value };
  tipo === null ? delete a[menu.value.colId] : (a[menu.value.colId] = tipo);
  colAggs.value = a;
  closeMenu();
}
function toggleGroupBy() {
  groupByCol.value     = groupByCol.value === menu.value.colId ? null : menu.value.colId;
  expandedGroups.value = new Set();
  closeMenu();
}

function applyFormato() {
  colFormatos.value = { ...colFormatos.value, [menu.value.colId]: menu.value.formato };
  if (menu.value.formato !== 'FECHA') {
    colPatrones.value = { ...colPatrones.value, [menu.value.colId]: null };
  }
}
function applyPatron() {
  colPatrones.value = { ...colPatrones.value, [menu.value.colId]: menu.value.patron || null };
}
</script>

<style scoped>
.grid-wrap { display: flex; flex-direction: column; gap: var(--e2); position: relative; }
.grid-meta { font-size: var(--t-xs); color: var(--texto-tenue); }
.grid-info { color: var(--texto-tenue); }

.empty {
  display: flex; flex-direction: column; align-items: center;
  gap: var(--e2); padding: var(--e5) 0;
  color: var(--texto-tenue); font-size: var(--t-sm);
}

/* ── contenedor ── */
.grid-container {
  overflow: auto;
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  max-height: 60vh;
}

table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); font-family: var(--fuente-mono); }

/* ── cabeceras ── */
thead th {
  position: sticky; top: 0;
  background: var(--panel-alt);
  box-shadow: inset 0 -2px 0 var(--borde-fuerte), 1px 0 0 var(--borde-fuerte);
  padding: 0;
  text-align: left;
  font-size: var(--t-xs);
  font-family: var(--fuente);
  font-weight: 600;
  color: var(--texto-suave);
  white-space: nowrap;
  user-select: none;
  cursor: default;
  z-index: 1;
}
thead th.sortable { cursor: pointer; }
thead th.sortable:hover .th-label { color: var(--texto); }
thead th.num .th-inner { justify-content: flex-end; }
thead th.th-toggle { width: 28px; box-shadow: inset 0 -2px 0 var(--borde-fuerte); }

.th-inner {
  display: flex; align-items: center; gap: 4px;
  padding: 7px var(--e3);
}
.th-label { flex: 1; }

.th-btn {
  flex-shrink: 0; opacity: 0;
  width: 20px; height: 20px;
  border: none; background: transparent;
  color: var(--texto-tenue); cursor: pointer;
  border-radius: 4px; font-size: 14px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .1s, background .1s;
}
thead th:hover .th-btn { opacity: 1; }
.th-btn:hover { background: var(--muted); color: var(--texto); }

.agg-badge { font-size: 10px; color: var(--accent); font-weight: 700; }

/* ── celdas ── */
tbody td {
  padding: 5px var(--e3);
  border-bottom: 1px solid var(--borde-fuerte);
  border-right: 1px solid var(--borde-fuerte);
  color: var(--texto);
  white-space: nowrap;
}
tbody td:last-child { border-right: none; }
tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }

tr.alt td { background: var(--panel-alt); }
tbody tr:not(.grp-hdr):hover td { background: color-mix(in srgb, var(--panel) 88%, var(--accent) 12%); }

/* ── agrupación ── */
.grp-hdr { cursor: pointer; }
.grp-hdr td {
  background: color-mix(in srgb, var(--panel-alt) 70%, var(--accent) 6%);
  border-bottom: 1px solid var(--borde-fuerte);
  border-right: none;
  padding: 5px var(--e2);
}
.grp-hdr:hover td {
  background: color-mix(in srgb, var(--panel-alt) 60%, var(--accent) 14%);
}

.grp-toggle-cell {
  text-align: center; width: 28px; min-width: 28px;
  font-size: 10px; color: var(--accent); font-weight: 700;
  border-right: 1px solid var(--borde-fuerte) !important;
}
.grp-title {
  font-size: var(--t-sm);
  font-family: var(--fuente);
  color: var(--texto);
  padding-left: var(--e3) !important;
}
.grp-count {
  font-size: var(--t-xs); color: var(--texto-tenue);
  margin-left: 6px; font-weight: normal;
}

.grp-leaf td { background: var(--panel); }
.grp-leaf.alt td { background: var(--panel-alt); }
.grp-indent {
  width: 28px; min-width: 28px;
  border-right: 2px solid var(--accent) !important;
  background: transparent !important;
  padding: 0 !important;
}
.grp-leaf:hover td { background: color-mix(in srgb, var(--panel) 88%, var(--accent) 12%); }

.grp-subtotal-row td {
  background: color-mix(in srgb, var(--panel-alt) 60%, var(--accent) 8%);
  border-top: 1px solid var(--borde-fuerte);
  border-bottom: 2px solid var(--borde-fuerte);
  border-right: 1px solid var(--borde-fuerte);
  padding: 4px var(--e3);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--texto);
}
.grp-subtotal-row td:last-child { border-right: none; }
.grp-subtotal-row td.num { text-align: right; }
.grp-subtotal-indent {
  width: 28px; min-width: 28px;
  border-right: 2px solid var(--accent) !important;
  background: transparent !important;
}

/* ── tfoot totales ── */
tfoot td {
  padding: 6px var(--e3);
  border-top: 2px solid var(--borde-fuerte);
  border-right: 1px solid var(--borde-fuerte);
  font-weight: 600;
  background: var(--panel-alt);
  color: var(--texto);
  font-variant-numeric: tabular-nums;
}
tfoot td:last-child { border-right: none; }
tfoot td.num { text-align: right; }

/* ── paginación ── */
.grid-pag {
  display: flex; align-items: center; gap: var(--e3);
  justify-content: center; padding: var(--e2) 0;
}
.pag-btn {
  padding: 4px 12px;
  border: 1px solid var(--borde-fuerte); border-radius: var(--r1);
  background: var(--panel); color: var(--texto);
  font-size: var(--t-sm); cursor: pointer;
  transition: background var(--transicion);
}
.pag-btn:hover:not(:disabled) { background: var(--panel-alt); }
.pag-btn:disabled { opacity: 0.4; cursor: default; }
.pag-label { font-size: var(--t-sm); color: var(--texto-suave); min-width: 6ch; text-align: center; }

/* ── menú columna ── */
.col-menu {
  z-index: 9900;
  min-width: 210px;
  background: var(--panel);
  border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2);
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  padding: var(--e2) 0;
  font-size: var(--t-sm);
}
.col-menu-title {
  display: flex; align-items: center; gap: 6px;
  padding: var(--e2) var(--e3);
  font-weight: 600; color: var(--texto);
  border-bottom: 1px solid var(--borde-fuerte);
  margin-bottom: var(--e1);
}
.col-menu-title > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-menu-icon { border: none; background: transparent; cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 4px; }
.col-menu-icon:hover { background: var(--muted); }
.col-rename-input {
  flex: 1; border: 1px solid var(--borde-fuerte); border-radius: var(--r1);
  padding: 3px 6px; font-size: var(--t-sm); background: var(--fondo); color: var(--texto);
  outline: none;
}
.col-rename-input:focus { border-color: var(--accent); }
.col-menu-apply {
  border: none; background: var(--accent); color: #fff;
  border-radius: var(--r1); padding: 2px 8px; cursor: pointer; font-size: var(--t-sm);
}
.col-menu-item {
  display: block; width: 100%; text-align: left;
  padding: 6px var(--e3); border: none; background: transparent;
  color: var(--texto); cursor: pointer; font-size: var(--t-sm);
  transition: background .1s;
}
.col-menu-item:hover { background: var(--panel-alt); }
.col-menu-item.active { color: var(--accent); font-weight: 600; }
.col-menu-section { padding: 4px var(--e3); font-size: var(--t-xs); color: var(--texto-tenue); text-transform: uppercase; letter-spacing: .05em; }
.col-menu-sep { height: 1px; background: var(--borde-fuerte); margin: var(--e1) 0; }
.col-menu-row { padding: 3px var(--e3); }
.col-menu-select {
  width: 100%; padding: 4px 6px; font-size: var(--t-sm); font-family: var(--fuente);
  border: 1px solid var(--borde-fuerte); border-radius: var(--r1);
  background: var(--panel-alt); color: var(--texto);
}
.col-menu-patron {
  width: 100%; padding: 4px 6px; font-size: var(--t-sm); font-family: monospace;
  border: 1px solid var(--borde-fuerte); border-radius: var(--r1);
  background: var(--panel-alt); color: var(--texto);
}
.col-menu-patron:focus, .col-menu-select:focus { outline: none; border-color: var(--accent); }
</style>
