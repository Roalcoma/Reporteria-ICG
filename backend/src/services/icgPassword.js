'use strict';
/**
 * Cifrado propietario de contrasenas de ICG.
 * Portado de frfran-web (auth.controller.js) y VERIFICADO contra
 * GENERAL.USUARIOS.NEWPASS: cada caracter del password se codifica en 2
 * digitos hex, con desplazamiento aditivo por la clave NORMALKEY.
 *
 *   cifrado[j] = hex( charCode + NORMALKEY[j % 9] )
 *   plano[j]   = charCode( byte    - NORMALKEY[j % 9] )
 */
const NORMALKEY = [78, 79, 82, 77, 65, 76, 75, 69, 89]; // N O R M A L K E Y

/** Descifra el valor almacenado (NEWPASS / BIGPASSENTRADA) a texto plano. */
function icgDecryptPass(encrypted) {
  if (!encrypted || encrypted.length % 2 !== 0) return '';
  let out = '';
  for (let i = 0, j = 0; i < encrypted.length; i += 2, j++) {
    const byte = parseInt(encrypted.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) return '';
    out += String.fromCharCode(byte - NORMALKEY[j % NORMALKEY.length]);
  }
  return out;
}

/** Cifra un password plano al formato ICG (hex mayuscula). */
function icgEncryptPass(plain) {
  if (plain == null) return '';
  let out = '';
  for (let j = 0; j < plain.length; j++) {
    const byte = (plain.charCodeAt(j) + NORMALKEY[j % NORMALKEY.length]) & 0xff;
    out += byte.toString(16).padStart(2, '0').toUpperCase();
  }
  return out;
}

/** Comparacion segura password-plano vs valor cifrado almacenado. */
function icgPassMatches(plain, encrypted) {
  return icgDecryptPass(encrypted) === plain;
}

module.exports = { icgDecryptPass, icgEncryptPass, icgPassMatches, NORMALKEY };
