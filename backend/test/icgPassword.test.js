'use strict';
/**
 * Verificacion del cifrado ICG contra un valor real de GENERAL.USUARIOS.NEWPASS.
 * Ejecutar:  node test/icgPassword.test.js
 * (No imprime el password en claro; solo confirma que el algoritmo es correcto.)
 */
const assert = require('assert');
const { icgDecryptPass, icgEncryptPass } = require('../src/services/icgPassword');

// NEWPASS real del usuario CODUSUARIO=339 ('TEST GENERICO') en la instalacion probada.
const NEWPASS_REAL = '8FB3BFB6AF7E7C89A0';

const plano = icgDecryptPass(NEWPASS_REAL);

// 1) Descifra a ASCII imprimible.
assert.ok(plano.length === NEWPASS_REAL.length / 2, 'longitud esperada');
assert.ok([...plano].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126),
  'todos los caracteres son ASCII imprimible');

// 2) Round-trip: cifrar de vuelta reproduce el NEWPASS almacenado.
assert.strictEqual(icgEncryptPass(plano), NEWPASS_REAL, 'round-trip cifrado == almacenado');

console.log('OK: cifrado ICG verificado (round-trip exacto contra NEWPASS real).');
