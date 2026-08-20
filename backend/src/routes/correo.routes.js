'use strict';
/**
 * CRUD mínimo para rep.ConfiguracionCorreo.
 * El password se cifra con AES-256-GCM (crypto.js) antes de persistirse.
 * Si no se envía password en un PUT, se conserva el existente.
 * Solo administradores pueden escribir; leer requiere autenticación.
 */
const express = require('express');
const sql = require('mssql');
const cm = require('../db/connectionManager');
const { encrypt } = require('../services/crypto');
const { requireAuth, requireEditor, asyncH } = require('../middleware/auth');

const router = express.Router();

/** Lista configuraciones SMTP sin exponer el password cifrado. */
router.get('/', requireAuth, asyncH(async (req, res) => {
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request().query(
    `SELECT CorreoConfigId, Nombre, Host, Puerto, Seguridad, Usuario,
            RemitenteNombre, RemitenteEmail, EsPredeterminada, Activo
     FROM rep.ConfiguracionCorreo ORDER BY EsPredeterminada DESC, CorreoConfigId`);
  res.json(recordset);
}));

/** Crea una nueva configuración SMTP. */
router.post('/', requireEditor, asyncH(async (req, res) => {
  const { Nombre, Host, Puerto, Seguridad, Usuario, Password,
          RemitenteNombre, RemitenteEmail, EsPredeterminada } = req.body;
  const pool = await cm.getConfigPool();
  const { recordset } = await pool.request()
    .input('nom',  sql.NVarChar(80),  Nombre)
    .input('host', sql.NVarChar(200), Host)
    .input('port', sql.Int,           Number(Puerto) || 587)
    .input('seg',  sql.VarChar(5),    Seguridad || 'TLS')
    .input('usr',  sql.NVarChar(200), Usuario || null)
    .input('pwd',  sql.VarBinary(sql.MAX), Password ? encrypt(Password) : null)
    .input('rnombre', sql.NVarChar(120), RemitenteNombre || null)
    .input('remail',  sql.NVarChar(200), RemitenteEmail)
    .input('pred', sql.Bit, EsPredeterminada ? 1 : 0)
    .query(`INSERT INTO rep.ConfiguracionCorreo
              (Nombre,Host,Puerto,Seguridad,Usuario,PasswordEnc,RemitenteNombre,RemitenteEmail,EsPredeterminada)
            VALUES (@nom,@host,@port,@seg,@usr,@pwd,@rnombre,@remail,@pred);
            SELECT SCOPE_IDENTITY() AS CorreoConfigId;`);
  res.status(201).json({ CorreoConfigId: recordset[0].CorreoConfigId });
}));

/** Actualiza una configuración SMTP (no toca el password si no se envía). */
router.put('/:id', requireEditor, asyncH(async (req, res) => {
  const { Nombre, Host, Puerto, Seguridad, Usuario, Password,
          RemitenteNombre, RemitenteEmail, EsPredeterminada, Activo } = req.body;
  const pool = await cm.getConfigPool();
  await pool.request()
    .input('id',   sql.Int,           Number(req.params.id))
    .input('nom',  sql.NVarChar(80),  Nombre)
    .input('host', sql.NVarChar(200), Host)
    .input('port', sql.Int,           Number(Puerto) || 587)
    .input('seg',  sql.VarChar(5),    Seguridad || 'TLS')
    .input('usr',  sql.NVarChar(200), Usuario || null)
    .input('pwd',  sql.VarBinary(sql.MAX), Password ? encrypt(Password) : null)
    .input('rnombre', sql.NVarChar(120), RemitenteNombre || null)
    .input('remail',  sql.NVarChar(200), RemitenteEmail)
    .input('pred', sql.Bit, EsPredeterminada ? 1 : 0)
    .input('act',  sql.Bit, Activo !== false ? 1 : 0)
    .query(`UPDATE rep.ConfiguracionCorreo
            SET Nombre=@nom, Host=@host, Puerto=@port, Seguridad=@seg, Usuario=@usr,
                PasswordEnc = CASE WHEN @pwd IS NULL THEN PasswordEnc ELSE @pwd END,
                RemitenteNombre=@rnombre, RemitenteEmail=@remail,
                EsPredeterminada=@pred, Activo=@act
            WHERE CorreoConfigId=@id`);
  res.json({ ok: true });
}));

module.exports = router;
