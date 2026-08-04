'use strict';
/**
 * Cifrado AES-256-GCM a nivel app para secretos guardados en la BD de config
 * (passwords de rep.ServidorCredencial y rep.ConfiguracionCorreo).
 * La llave (APP_CRYPTO_KEY) es de 32 bytes en hex y vive SOLO en el .env,
 * nunca en la base de datos.  Formato del blob: [IV(12) | TAG(16) | CIPHER].
 */
const crypto = require('crypto');
const cfg = require('../config');

function key() {
  const k = Buffer.from(cfg.cryptoKeyHex, 'hex');
  if (k.length !== 32) {
    throw new Error('APP_CRYPTO_KEY debe ser de 32 bytes (64 hex).');
  }
  return k;
}

/** string -> Buffer (para columnas VARBINARY(MAX)). */
function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

/** Buffer (VARBINARY) -> string. */
function decrypt(blob) {
  if (blob == null) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
