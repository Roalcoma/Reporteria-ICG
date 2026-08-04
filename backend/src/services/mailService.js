'use strict';
const nodemailer = require('nodemailer');
const sql = require('mssql');
const cm = require('../db/connectionManager');
const { decrypt } = require('./crypto');

/**
 * Envío de correos con el reporte adjunto (ad-hoc y programado) y registro en
 * rep.EnvioCorreoHistorial. La config SMTP vive en rep.ConfiguracionCorreo
 * (password cifrado con AES a nivel app).
 */
class MailService {
  async _transport(correoConfigId) {
    const pool = await cm.getConfigPool();
    const req = pool.request();
    const where = correoConfigId ? 'CorreoConfigId=@id' : 'EsPredeterminada=1 AND Activo=1';
    if (correoConfigId) req.input('id', sql.Int, correoConfigId);
    const { recordset } = await req.query(
      `SELECT TOP 1 * FROM rep.ConfiguracionCorreo WHERE ${where}`);
    const c = recordset[0];
    if (!c) throw Object.assign(new Error('Sin configuración SMTP'), { status: 400 });
    const transporter = nodemailer.createTransport({
      host: c.Host, port: c.Puerto,
      secure: c.Seguridad === 'SSL',
      requireTLS: c.Seguridad === 'TLS',
      auth: c.Usuario ? { user: c.Usuario, pass: c.PasswordEnc ? decrypt(c.PasswordEnc) : '' } : undefined
    });
    return { transporter, from: `"${c.RemitenteNombre || ''}" <${c.RemitenteEmail}>` };
  }

  /**
   * @param {object} p { reporteId, programacionId?, origen, usuarioAppId?, empresaId?,
   *   destinatarios(string ';'), asunto, cuerpo, adjunto:{filename,content,contentType},
   *   formato, filas, parametros, correoConfigId? }
   */
  async enviarReporte(p) {
    const pool = await cm.getConfigPool();
    let estado = 'OK', error = null;
    try {
      const { transporter, from } = await this._transport(p.correoConfigId);
      await transporter.sendMail({
        from, to: p.destinatarios.split(';').map(s => s.trim()).filter(Boolean),
        subject: p.asunto || 'Reporte',
        text: p.cuerpo || 'Adjunto el reporte solicitado.',
        attachments: p.adjunto ? [p.adjunto] : []
      });
    } catch (e) { estado = 'ERROR'; error = e.message; }

    await pool.request()
      .input('rid', sql.Int, p.reporteId)
      .input('pid', sql.Int, p.programacionId ?? null)
      .input('org', sql.VarChar(10), p.origen || 'MANUAL')
      .input('uid', sql.Int, p.usuarioAppId ?? null)
      .input('eid', sql.Int, p.empresaId ?? null)
      .input('dest', sql.NVarChar(sql.MAX), p.destinatarios)
      .input('asu', sql.NVarChar(200), p.asunto ?? null)
      .input('fmt', sql.VarChar(6), p.formato ?? null)
      .input('par', sql.NVarChar(sql.MAX), p.parametros ? JSON.stringify(p.parametros) : null)
      .input('est', sql.VarChar(6), estado)
      .input('err', sql.NVarChar(sql.MAX), error)
      .input('fil', sql.Int, p.filas ?? null)
      .query(`INSERT INTO rep.EnvioCorreoHistorial
        (ReporteId,ProgramacionId,Origen,UsuarioAppId,EmpresaId,Destinatarios,Asunto,
         FormatoAdjunto,ParametrosJson,Estado,MensajeError,FilasResultado)
        VALUES (@rid,@pid,@org,@uid,@eid,@dest,@asu,@fmt,@par,@est,@err,@fil)`);

    if (estado === 'ERROR') throw Object.assign(new Error('Fallo el envío: ' + error), { status: 502 });
    return { estado };
  }
}

module.exports = new MailService();
