'use strict';
/**
 * Aplica al arrancar los scripts de db/ que aún no corrieron, en orden por nombre.
 * Cada archivo corre UNA sola vez: los MERGE del catálogo pisan lo editado desde
 * la app, así que re-ejecutarlos revertiría cambios de los usuarios.
 *
 * Instalación nueva: crear la BD con db/instalar.ps1 (01 contiene CREATE DATABASE).
 */
const fs = require('fs');
const path = require('path');
const cm = require('./connectionManager');

const DIR = path.resolve(__dirname, '../../../db');
// ponytail: instalaciones previas a rep.Migracion se asumen con 01-12 aplicados
// (sin 12_pdf el PDF no funcionaría); desde 13 todo pasa por aquí.
const BASELINE_HASTA = 12;
const numero = (f) => Number(f.split('_')[0]);

let estado = { ok: true, aplicadas: [], error: null };

/** Separa un script en lotes por las líneas `GO` y quita los `USE`: corre en la BD configurada. */
function lotes(texto) {
  return texto
    .replace(/^﻿/, '')
    .split(/^\s*GO\s*;?\s*$/gim)
    .map(b => b.replace(/^\s*USE\s+\S+\s*;?\s*$/gim, '').trim())
    .filter(Boolean);
}

async function aplicarPendientes() {
  const pool = await cm.getConfigPool();
  const { recordset: [r] } = await pool.request().query(`
    SELECT OBJECT_ID('rep.Migracion') AS tabla, OBJECT_ID('rep.Reporte') AS reporte`);

  const archivos = fs.readdirSync(DIR).filter(f => /^\d+_.+\.sql$/i.test(f))
    .sort((a, b) => numero(a) - numero(b));

  if (!r.tabla) {
    await pool.request().batch(`
      CREATE TABLE rep.Migracion (
        Archivo   NVARCHAR(200) NOT NULL PRIMARY KEY,
        Aplicada  DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        Baseline  BIT           NOT NULL DEFAULT 0
      )`);
    if (r.reporte) {
      for (const f of archivos.filter(f => numero(f) <= BASELINE_HASTA)) {
        await pool.request().input('f', f)
          .query(`INSERT INTO rep.Migracion (Archivo, Baseline) VALUES (@f, 1)`);
      }
    }
  }

  const { recordset } = await pool.request().query(`SELECT Archivo FROM rep.Migracion`);
  const hechas = new Set(recordset.map(x => x.Archivo.toLowerCase()));
  const aplicadas = [];

  for (const f of archivos.filter(f => !hechas.has(f.toLowerCase()))) {
    for (const lote of lotes(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
      await pool.request().batch(lote);
    }
    await pool.request().input('f', f).query(`INSERT INTO rep.Migracion (Archivo) VALUES (@f)`);
    aplicadas.push(f);
    console.log(`[migraciones] aplicada ${f}`);
  }
  return aplicadas;
}

/** Corre las pendientes sin tumbar el servidor: si falla, queda en el log y en /api/health. */
async function migrarAlArrancar() {
  try {
    estado = { ok: true, aplicadas: await aplicarPendientes(), error: null };
  } catch (e) {
    estado = { ok: false, aplicadas: [], error: e.message };
    console.error('[migraciones] ERROR:', e.message);
  }
  return estado;
}

module.exports = { migrarAlArrancar, lotes, estadoMigraciones: () => estado };
