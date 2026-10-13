'use strict';
/**
 * Actualización desde GitHub Releases.
 *
 * Todo lo pesado (descarga, npm ci, build del frontend) ocurre en una carpeta de
 * staging: si falla, la instalación en uso queda intacta. Solo al final se hace
 * backup, se copia sobre la instalación y, si la copia falla, se restaura.
 * Las migraciones SQL las aplica el propio servidor al arrancar (db/migraciones.js).
 *
 * El reinicio lo hace el supervisor (NSSM): con ACTUALIZACION_REINICIAR=1 el proceso
 * termina tras copiar y NSSM lo levanta con el código nuevo. Sin supervisor, salir
 * dejaría el sistema caído, por eso es opt-in.
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { execFile } = require('child_process');

const REPO = process.env.GITHUB_REPO; // 'owner/repo'
const ROOT = path.resolve(__dirname, '../../..');
const BACKUPS = path.resolve(ROOT, '..', `${path.basename(ROOT)}_backups`);
const REINICIAR = process.env.ACTUALIZACION_REINICIAR === '1';

const localVersion = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/package.json'), 'utf8')).version;

/** 'v0.7.3' > '0.7.2' → 1 */
function compararVersion(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map(Number);
  const pb = String(b).replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiados redirects'));
    https.get(url, { headers: { 'User-Agent': 'ICG-Reporteria-Updater/2.0', Accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} en ${url}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Ejecuta un comando y rechaza con su salida si falla. robocopy usa códigos < 8 como éxito. */
function run(cmd, args, cwd, { okCodes = [0], timeout = 15 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, shell: true, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
        if (okCodes.includes(code)) return resolve(stdout);
        reject(new Error(`${cmd} ${args.join(' ')} falló (código ${code}): ${String(stderr || stdout).slice(-1500)}`));
      });
  });
}

const npm = () => {
  const p = path.join(path.dirname(process.execPath), 'npm.cmd');
  return fs.existsSync(p) ? `"${p}"` : 'npm';
};
const ROBOCOPY_OK = [0, 1, 2, 3, 4, 5, 6, 7];
const robocopy = (src, dst, extra = []) =>
  run('robocopy', [`"${src}"`, `"${dst}"`, '/E', '/R:2', '/W:2', '/NFL', '/NDL', '/NP', ...extra], ROOT, { okCodes: ROBOCOPY_OK });

async function checkVersion() {
  if (!REPO) throw Object.assign(new Error('GITHUB_REPO no está configurado en .env'), { status: 503 });
  const release = JSON.parse((await httpGet(`https://api.github.com/repos/${REPO}/releases/latest`)).toString('utf8'));
  if (!release.tag_name) throw Object.assign(new Error('No se encontró ninguna release en el repositorio'), { status: 404 });

  const zipAsset = (release.assets || []).find(a => a.name.endsWith('.zip'));
  const versionActual = localVersion();
  return {
    tagRemoto: release.tag_name,
    versionActual,
    hayActualizacion: compararVersion(release.tag_name, versionActual) > 0,
    urlDescarga: zipAsset ? zipAsset.browser_download_url : release.zipball_url,
    nombreArchivo: zipAsset ? zipAsset.name : `${REPO.split('/')[1]}-${release.tag_name}.zip`,
    reinicioAutomatico: REINICIAR
  };
}

function podarBackups(conservar) {
  const dirs = fs.readdirSync(BACKUPS)
    .map(d => ({ d, t: fs.statSync(path.join(BACKUPS, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { d } of dirs.slice(conservar)) fs.rmSync(path.join(BACKUPS, d), { recursive: true, force: true });
}

// ── Proceso de actualización (uno a la vez, estado en memoria) ─────────────
let progreso = { estado: 'inactivo', pasos: [], error: null, version: null };
const paso = (texto) => { progreso.pasos.push({ texto, hora: new Date().toISOString() }); console.log(`[actualizacion] ${texto}`); };

async function ejecutar(info) {
  const ts = Date.now();
  const tmp = path.join(os.tmpdir(), `icg-update-${ts}`);
  const zip = `${tmp}.zip`;
  const backup = path.join(BACKUPS, `${info.versionActual}-${ts}`);
  let copiando = false;
  try {
    paso(`Descargando ${info.nombreArchivo}`);
    fs.writeFileSync(zip, await httpGet(info.urlDescarga));

    paso('Extrayendo');
    fs.mkdirSync(tmp, { recursive: true });
    await run('powershell', ['-NoProfile', '-Command', `"Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force"`], tmp);
    const dentro = fs.readdirSync(tmp);
    const src = dentro.length === 1 && fs.statSync(path.join(tmp, dentro[0])).isDirectory() ? path.join(tmp, dentro[0]) : tmp;
    if (!fs.existsSync(path.join(src, 'backend/package.json'))) throw new Error('El paquete descargado no tiene la estructura esperada');

    paso('Instalando dependencias del backend');
    await run(npm(), ['ci', '--omit=dev', '--no-audit', '--no-fund'], path.join(src, 'backend'));
    paso('Instalando dependencias del frontend');
    await run(npm(), ['ci', '--no-audit', '--no-fund'], path.join(src, 'frontend-vue'));
    paso('Compilando el frontend');
    await run(npm(), ['run', 'build'], path.join(src, 'frontend-vue'));

    paso(`Backup de la instalación actual en ${backup}`);
    await robocopy(ROOT, backup, ['/XD', 'node_modules', '.git', '.cache']);
    podarBackups(3);

    paso('Copiando archivos nuevos');
    copiando = true;
    await robocopy(src, ROOT, ['/XD', 'node_modules', '.git', 'dist']);
    await robocopy(path.join(src, 'frontend-vue/dist'), path.join(ROOT, 'frontend-vue/dist'), ['/PURGE']);
    await robocopy(path.join(src, 'backend/node_modules'), path.join(ROOT, 'backend/node_modules'));
    copiando = false;

    progreso.estado = REINICIAR ? 'reiniciando' : 'listo';
    paso(REINICIAR ? 'Listo. Reiniciando el servicio…' : 'Listo. Reinicie el backend y el worker para aplicar la versión nueva.');
    // ponytail: el worker detecta la versión nueva por su cuenta (worker.js).
    if (REINICIAR) setTimeout(() => process.exit(0), 1500);
  } catch (e) {
    progreso.estado = 'error';
    progreso.error = e.message;
    paso(`Error: ${e.message}`);
    if (copiando) {
      paso('Restaurando el backup');
      // ponytail: restaura el código; node_modules puede quedar mezclado, se corrige con npm ci.
      await robocopy(backup, ROOT, ['/XD', 'node_modules']).catch(err => paso(`No se pudo restaurar: ${err.message}`));
    }
  } finally {
    fs.rmSync(zip, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Inicia la actualización en segundo plano. La URL la decide el servidor, nunca el cliente. */
async function iniciar() {
  if (progreso.estado === 'aplicando') throw Object.assign(new Error('Ya hay una actualización en curso'), { status: 409 });
  const info = await checkVersion();
  if (!info.hayActualizacion) throw Object.assign(new Error(`Ya está instalada la última versión (${info.versionActual})`), { status: 409 });
  progreso = { estado: 'aplicando', pasos: [], error: null, version: info.tagRemoto };
  ejecutar(info);
  return progreso;
}

module.exports = { checkVersion, iniciar, progreso: () => progreso, compararVersion };
