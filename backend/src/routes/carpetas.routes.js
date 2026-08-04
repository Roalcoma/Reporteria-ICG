'use strict';
const express = require('express');
const sql = require('mssql');
const cm = require('../db/connectionManager');
const repo = require('../services/reporteRepository');
const { requireAuth, requireEditor, asyncH } = require('../middleware/auth');

const router = express.Router();

// Árbol de carpetas (grupos/subgrupos)
router.get('/', requireAuth, asyncH(async (req, res) => {
  res.json(await repo.getArbolCarpetas());
}));

// Crear carpeta
router.post('/', requireEditor, asyncH(async (req, res) => {
  const { Nombre, CarpetaPadreId, Orden } = req.body;
  if (!Nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('n', sql.NVarChar(120), Nombre)
    .input('p', sql.Int, CarpetaPadreId ?? null)
    .input('o', sql.Int, Orden ?? 0)
    .query(`INSERT INTO rep.Carpeta (Nombre, CarpetaPadreId, Orden)
            OUTPUT inserted.CarpetaId VALUES (@n, @p, @o)`);
  res.status(201).json({ CarpetaId: recordset[0].CarpetaId });
}));

// Renombrar/mover carpeta
router.put('/:id', requireEditor, asyncH(async (req, res) => {
  const { Nombre, CarpetaPadreId, Orden } = req.body;
  const pool = await cm.getConfigPool();
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('n', sql.NVarChar(120), Nombre)
    .input('p', sql.Int, CarpetaPadreId ?? null)
    .input('o', sql.Int, Orden ?? 0)
    .query(`UPDATE rep.Carpeta SET Nombre=@n, CarpetaPadreId=@p, Orden=@o WHERE CarpetaId=@id`);
  res.json({ ok: true });
}));

/**
 * Elimina una carpeta. Se niega si tiene subcarpetas o reportes activos, para
 * no dejar contenido inaccesible; primero hay que vaciarla o mover su contenido.
 */
router.delete('/:id', requireEditor, asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT
              (SELECT COUNT(*) FROM rep.Carpeta WHERE CarpetaPadreId = @id AND Activo = 1) AS Subcarpetas,
              (SELECT COUNT(*) FROM rep.Reporte WHERE CarpetaId = @id AND Activo = 1) AS Reportes`);
  const { Subcarpetas, Reportes } = recordset[0];
  if (Subcarpetas > 0 || Reportes > 0) {
    return res.status(409).json({
      error: `La carpeta no está vacía: contiene ${Reportes} reporte(s) y ` +
             `${Subcarpetas} subcarpeta(s). Muévalos o elimínelos primero.`
    });
  }

  // Los reportes eliminados conservan su fila (borrado lógico) y seguirían
  // apuntando a la carpeta, lo que rompería la clave foránea: se desvinculan
  // antes de borrar, sin perder su historial.
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('id', sql.Int, id)
      .query(`UPDATE rep.Reporte SET CarpetaId = NULL WHERE CarpetaId = @id`);
    await new sql.Request(tx).input('id', sql.Int, id)
      .query(`UPDATE rep.Carpeta SET CarpetaPadreId = NULL WHERE CarpetaPadreId = @id`);
    await new sql.Request(tx).input('id', sql.Int, id)
      .query(`DELETE FROM rep.Carpeta WHERE CarpetaId = @id`);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  res.json({ ok: true });
}));

module.exports = router;
