'use strict';
const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execSync } = require('child_process');

const REPO = process.env.GITHUB_REPO; // 'owner/repo'
const ROOT = path.resolve(__dirname, '../../..'); // raíz del proyecto

// ── helpers ────────────────────────────────────────────────────────────────

function localVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}

/**
 * GET HTTP/HTTPS con seguimiento de redirects (máx 5).
 * Devuelve un Buffer con el cuerpo completo de la respuesta.
 */
function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiados redirects'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, {
      headers: {
        'User-Agent': 'ICG-Reporteria-Updater/1.0',
        Accept: 'application/vnd.github+json'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} en ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── exports ────────────────────────────────────────────────────────────────

/**
 * Consulta la última release en GitHub y compara con la versión local.
 * @returns {{ tagRemoto, urlDescarga, nombreArchivo, versionActual }}
 */
async function checkVersion() {
  if (!REPO) {
    const e = new Error('GITHUB_REPO no está configurado en .env');
    e.status = 503;
    throw e;
  }
  const buf     = await httpGet(`https://api.github.com/repos/${REPO}/releases/latest`);
  const release = JSON.parse(buf.toString('utf8'));

  if (release.message === 'Not Found' || !release.tag_name) {
    const e = new Error('No se encontró ninguna release en el repositorio');
    e.status = 404;
    throw e;
  }

  const tagRemoto = release.tag_name;

  // Preferir un asset .zip subido manualmente; si no hay, usar el zipball de GitHub
  const zipAsset    = (release.assets || []).find(a => a.name.endsWith('.zip'));
  const urlDescarga = zipAsset
    ? zipAsset.browser_download_url
    : release.zipball_url;
  const repoName    = REPO.split('/')[1] || 'repo';
  const nombreArchivo = zipAsset
    ? zipAsset.name
    : `${repoName}-${tagRemoto}.zip`;

  return { tagRemoto, urlDescarga, nombreArchivo, versionActual: localVersion() };
}

/**
 * Descarga el ZIP desde urlZip, lo extrae y copia los archivos sobre ROOT.
 * Soporta el formato zipball de GitHub (que crea una subcarpeta interna).
 */
async function descargarYExtraer(urlZip) {
  if (!REPO) {
    const e = new Error('GITHUB_REPO no está configurado en .env');
    e.status = 503;
    throw e;
  }

  const ts         = Date.now();
  const zipPath    = path.join(os.tmpdir(), `icg-update-${ts}.zip`);
  const extractDir = path.join(os.tmpdir(), `icg-update-extract-${ts}`);

  try {
    // 1. Descargar
    const buf = await httpGet(urlZip);
    fs.writeFileSync(zipPath, buf);

    // 2. Extraer en carpeta temporal
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { timeout: 120_000 }
    );

    // 3. Detectar si GitHub creó una subcarpeta (zipball → 'owner-repo-hash/')
    const entries   = fs.readdirSync(extractDir);
    const sourceDir = (entries.length === 1 &&
      fs.statSync(path.join(extractDir, entries[0])).isDirectory())
      ? path.join(extractDir, entries[0])
      : extractDir;

    // 4. Copiar sobre ROOT
    execSync(
      `powershell -Command "Copy-Item -Path '${sourceDir}\\*' -Destination '${ROOT}' -Recurse -Force"`,
      { timeout: 60_000 }
    );

    return { ok: true };
  } finally {
    try { fs.unlinkSync(zipPath); } catch { /* ignorar */ }
    try {
      execSync(
        `powershell -Command "Remove-Item -Recurse -Force '${extractDir}'"`,
        { timeout: 30_000 }
      );
    } catch { /* ignorar */ }
  }
}

module.exports = { checkVersion, descargarYExtraer };
