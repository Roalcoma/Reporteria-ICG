<template>
  <div class="branding-view">
    <div class="bv-header">
      <h1 class="bv-title">Identidad corporativa</h1>
      <p class="bv-sub">Logo, nombre y datos que aparecerán en todos los exports (PDF, Excel, HTML, etc.)</p>
    </div>

    <!-- Selector de empresa -->
    <div class="empresa-row">
      <label class="field-label">Empresa</label>
      <select v-model="codEmpresaSelec" class="empresa-select" @change="cargarBranding">
        <option value="">— Seleccionar empresa —</option>
        <option v-for="e in empresas" :key="e.codEmpresa" :value="e.codEmpresa">
          {{ e.nombre || e.codEmpresa }}
        </option>
      </select>
    </div>

    <div v-if="codEmpresaSelec" class="bv-body">
      <!-- ── Form ── -->
      <div class="form-panel">

        <!-- Logo -->
        <div class="field-group">
          <label class="field-label">Logo</label>
          <div class="logo-zone" :class="{ 'logo-zone--has': form.logoDataUri }" @click="fileInput?.click()">
            <img v-if="form.logoDataUri" :src="form.logoDataUri" class="logo-img" />
            <div v-else class="logo-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
              <span>Clic para subir imagen</span>
              <span class="logo-hint">PNG, JPG, WebP, SVG · máx. 1 MB</span>
            </div>
          </div>
          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden @change="onLogo" />
          <button v-if="form.logoDataUri" class="btn-quitar-logo" @click.prevent="quitarLogo">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            Quitar logo
          </button>
        </div>

        <!-- Nombre -->
        <div class="field-group">
          <label class="field-label">Nombre de la tienda / empresa <span class="req">*</span></label>
          <input v-model="form.nombre" class="field-input" placeholder="Ej: Droguería IKO 2025, C.A." maxlength="120" />
        </div>

        <!-- Info extra -->
        <div class="field-group">
          <label class="field-label">Información adicional</label>
          <textarea v-model="form.infoExtra" class="field-textarea" rows="3"
            placeholder="RIF, dirección, teléfono, correo..."></textarea>
        </div>

        <!-- Pie -->
        <div class="field-group">
          <label class="field-label">Pie de página</label>
          <textarea v-model="form.pie" class="field-textarea" rows="2"
            placeholder="Ej: Documento generado por el sistema de reportería. Confidencial."></textarea>
        </div>

        <div class="form-actions">
          <button class="btn-guardar" :disabled="guardando || !form.nombre.trim()" @click="guardar">
            <svg v-if="guardando" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>
            </svg>
            {{ guardando ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>

      <!-- ── Preview ── -->
      <div class="preview-panel">
        <div class="preview-label">Vista previa del encabezado en exports</div>
        <div class="preview-card">
          <!-- Header mock -->
          <div class="prev-header">
            <img v-if="form.logoDataUri" :src="form.logoDataUri" class="prev-logo" />
            <div class="prev-text">
              <strong v-if="form.nombre" class="prev-nombre">{{ form.nombre }}</strong>
              <span v-if="form.infoExtra" class="prev-info">{{ form.infoExtra }}</span>
            </div>
          </div>
          <div class="prev-divider"></div>
          <!-- Tabla de ejemplo -->
          <div class="prev-titulo">Nombre del reporte</div>
          <table class="prev-table">
            <thead><tr><th>Columna 1</th><th>Columna 2</th><th>Columna 3</th></tr></thead>
            <tbody>
              <tr><td>Dato A</td><td>Dato B</td><td>123,45</td></tr>
              <tr class="alt"><td>Dato C</td><td>Dato D</td><td>678,90</td></tr>
            </tbody>
          </table>
          <!-- Pie mock -->
          <div v-if="form.pie" class="prev-divider"></div>
          <div v-if="form.pie" class="prev-pie">{{ form.pie }}</div>
          <div class="prev-footer-bar">
            <span>{{ fechaHoy }}</span>
            <span>Página 1 de 1</span>
          </div>
        </div>

        <!-- Tip -->
        <div class="preview-tip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          El logo en PDF se escala a ~110×46 px. Los formatos CSV y JSON no incluyen encabezado visual.
        </div>
      </div>
    </div>

    <!-- Estado vacío -->
    <div v-if="!codEmpresaSelec" class="bv-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/><path d="M2 12h20"/>
      </svg>
      <span>Seleccioná una empresa para configurar su identidad corporativa</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '@/api.js';
import { useToastStore } from '@/stores/toasts.js';
import { useSessionStore } from '@/stores/session.js';

const toast   = useToastStore();
const session = useSessionStore();

const empresas        = computed(() => session.empresas || []);
const codEmpresaSelec = ref('');
const cargando        = ref(false);
const guardando       = ref(false);
const fileInput       = ref(null);

const form = reactive({
  logoDataUri: null,
  nombre:      '',
  infoExtra:   '',
  pie:         ''
});

const fechaHoy = computed(() =>
  new Date().toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
);

onMounted(async () => {
  if (!session.empresas.length) {
    const lista = await api.empresas('GESTION').catch(() => []);
    session.empresas = lista;
  }
  // Auto-seleccionar si solo hay una
  if (session.empresas.length === 1) {
    codEmpresaSelec.value = session.empresas[0].codEmpresa;
    await cargarBranding();
  }
});

async function cargarBranding() {
  if (!codEmpresaSelec.value) return;
  cargando.value = true;
  try {
    const b = await api.brandingGet(codEmpresaSelec.value);
    form.logoDataUri = b.logoDataUri || null;
    const parsed = parseEncabezado(b.encabezadoHtml || '');
    form.nombre    = parsed.nombre;
    form.infoExtra = parsed.infoExtra;
    form.pie       = stripHtml(b.pieHtml || '');
  } catch (e) {
    // Sin branding todavía → limpiar form
    form.logoDataUri = null;
    form.nombre      = '';
    form.infoExtra   = '';
    form.pie         = '';
  } finally {
    cargando.value = false;
  }
}

function parseEncabezado(html) {
  if (!html) return { nombre: '', infoExtra: '' };
  const m = /^<strong>(.*?)<\/strong>(?:<br\s*\/?>)?([\s\S]*)$/i.exec(html);
  if (m) return {
    nombre:    m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'),
    infoExtra: m[2].replace(/<br\s*\/?>/gi, '\n').replace(/&amp;/g,'&').trim()
  };
  return { nombre: '', infoExtra: stripHtml(html) };
}

function buildEncabezado() {
  const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const parts = [];
  if (form.nombre.trim())    parts.push(`<strong>${e(form.nombre.trim())}</strong>`);
  if (form.infoExtra.trim()) parts.push(e(form.infoExtra.trim()).replace(/\n/g, '<br>'));
  return parts.join('<br>');
}

function stripHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function onLogo(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) { toast.error('El logo supera 1 MB'); return; }
  const reader = new FileReader();
  reader.onload = ev => { form.logoDataUri = ev.target.result; };
  reader.readAsDataURL(file);
  e.target.value = '';
}

async function quitarLogo() {
  form.logoDataUri = null;
  if (!codEmpresaSelec.value) return;
  try {
    await api.brandingQuitarLogo(codEmpresaSelec.value);
  } catch { /* si aún no estaba guardado, ignorar */ }
}

async function guardar() {
  if (!form.nombre.trim()) return;
  guardando.value = true;
  try {
    await api.guardarBranding({
      tipo:          'GESTION',
      codigoICG:     codEmpresaSelec.value,
      ejercicio:     null,
      logoDataUri:   form.logoDataUri,
      encabezadoHtml: buildEncabezado(),
      pieHtml:       form.pie.trim() ? `<p>${form.pie.trim().replace(/\n/g, '<br>')}</p>` : ''
    });
    toast.ok('Branding guardado correctamente');
  } catch (e) {
    toast.error(e.message);
  } finally {
    guardando.value = false;
  }
}
</script>

<style scoped>
.branding-view {
  display: flex; flex-direction: column; gap: var(--e4);
  padding: var(--e4); max-width: 1100px;
}

.bv-header { display: flex; flex-direction: column; gap: 4px; }
.bv-title { font-size: var(--t-xl); font-weight: 700; color: var(--titulo); margin: 0; }
.bv-sub   { font-size: var(--t-sm); color: var(--texto-tenue); margin: 0; }

/* Selector empresa */
.empresa-row { display: flex; align-items: center; gap: var(--e3); }
.empresa-select {
  padding: 7px var(--e3); border: 1px solid var(--borde-fuerte); border-radius: var(--r1);
  background: var(--panel); color: var(--texto); font-size: var(--t-base);
  min-width: 280px; cursor: pointer;
}
.empresa-select:focus { outline: none; border-color: var(--accent); }

/* Body: form + preview */
.bv-body {
  display: grid; grid-template-columns: 400px 1fr; gap: var(--e4); align-items: start;
}

/* ── Form panel ── */
.form-panel {
  display: flex; flex-direction: column; gap: var(--e3);
  background: var(--panel); border: 1px solid var(--borde-fuerte);
  border-radius: var(--r2); padding: var(--e4);
}

.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: var(--t-sm); font-weight: 600; color: var(--texto-suave); }
.req { color: var(--error); }

.field-input, .field-textarea {
  border: 1px solid var(--borde-fuerte); border-radius: var(--r1);
  padding: 8px var(--e3); background: var(--fondo); color: var(--texto);
  font-size: var(--t-base); font-family: var(--fuente); resize: vertical;
  transition: border-color var(--transicion);
}
.field-input:focus, .field-textarea:focus { outline: none; border-color: var(--accent); }

/* Logo zone */
.logo-zone {
  border: 2px dashed var(--borde-fuerte); border-radius: var(--r2);
  cursor: pointer; transition: border-color var(--transicion), background var(--transicion);
  display: flex; align-items: center; justify-content: center;
  min-height: 110px; padding: var(--e3);
  background: var(--fondo);
}
.logo-zone:hover { border-color: var(--accent); background: color-mix(in srgb, var(--fondo) 94%, var(--accent) 6%); }
.logo-zone--has { border-style: solid; }

.logo-img { max-height: 80px; max-width: 100%; object-fit: contain; display: block; }

.logo-placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  color: var(--texto-tenue); font-size: var(--t-sm);
}
.logo-hint { font-size: var(--t-xs); color: var(--texto-tenue); }

.btn-quitar-logo {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: 1px solid var(--borde-fuerte);
  border-radius: var(--r1); padding: 4px 10px;
  color: var(--error); font-size: var(--t-xs); cursor: pointer;
  align-self: flex-start; transition: background var(--transicion);
}
.btn-quitar-logo:hover { background: color-mix(in srgb, var(--panel-alt) 80%, var(--error) 10%); }

.form-actions { padding-top: var(--e2); border-top: 1px solid var(--borde-fuerte); }

.btn-guardar {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 20px; border: none; border-radius: var(--r1);
  background: var(--accent); color: #fff;
  font-size: var(--t-base); font-weight: 600; cursor: pointer;
  transition: opacity var(--transicion);
}
.btn-guardar:disabled { opacity: .5; cursor: not-allowed; }
.btn-guardar:not(:disabled):hover { opacity: .88; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }

/* ── Preview panel ── */
.preview-panel { display: flex; flex-direction: column; gap: var(--e2); }
.preview-label {
  font-size: var(--t-xs); font-weight: 600; text-transform: uppercase;
  letter-spacing: .06em; color: var(--texto-tenue);
}

.preview-card {
  background: #fff; color: #222;
  border: 1px solid var(--borde-fuerte); border-radius: var(--r2);
  padding: 20px 24px; font-family: Helvetica, Arial, sans-serif; font-size: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}

.prev-header {
  display: flex; align-items: flex-start; gap: 16px;
  padding-bottom: 10px;
}
.prev-logo { max-height: 46px; max-width: 110px; object-fit: contain; }
.prev-text { display: flex; flex-direction: column; gap: 2px; }
.prev-nombre { font-size: 13px; font-weight: 700; color: #111; }
.prev-info { font-size: 11px; color: #555; white-space: pre-line; }

.prev-divider { height: 1px; background: #ccc; margin: 8px 0; }
.prev-titulo { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #111; }

.prev-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.prev-table th { background: #eef1f5; padding: 4px 8px; text-align: left; border: 1px solid #ccc; font-size: 10px; }
.prev-table td { padding: 4px 8px; border: 1px solid #ccc; }
.prev-table tr.alt td { background: #fafbfc; }

.prev-pie { font-size: 10px; color: #777; font-style: italic; }
.prev-footer-bar {
  display: flex; justify-content: space-between;
  font-size: 9px; color: #999; margin-top: 8px;
}

.preview-tip {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: var(--t-xs); color: var(--texto-tenue); line-height: 1.5;
}

/* Vacío */
.bv-empty {
  display: flex; align-items: center; gap: var(--e3);
  padding: var(--e5) 0; color: var(--texto-tenue); font-size: var(--t-sm);
}
.bv-empty svg { opacity: .3; flex-shrink: 0; }

/* Responsive */
@media (max-width: 900px) {
  .bv-body { grid-template-columns: 1fr; }
}
</style>
