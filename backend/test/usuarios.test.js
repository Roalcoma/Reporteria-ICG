'use strict';
/**
 * Pruebas de las salvaguardas de administración de roles.
 * Se sustituyen las consultas a BD por dobles en memoria, así corren sin
 * SQL Server.  Ejecutar: node test/usuarios.test.js
 */
const assert = require('assert');
const usuarios = require('../src/services/usuarioService');

let ok = 0, fallos = 0;
const testAsync = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};

const EJECUTOR = { codUsuario: 10, usuario: 'ADMIN', appRol: { UsuarioAppId: 1 } };
/** Sustituye los accesos a BD del servicio por valores controlados. */
function simular({ asignacion = null, otrosAdmins = 0 }) {
  usuarios._getAsignacion = async () => asignacion;
  usuarios.contarAdministradores = async () => otrosAdmins;
  usuarios._historial = async () => {};
}

(async () => {
  console.log('\nSalvaguardas de administración de roles');

  await testAsync('nadie puede cambiar su propio rol', async () => {
    simular({});
    await assert.rejects(
      () => usuarios.asignarRol({ codUsuarioICG: 10, appRolId: 1 }, EJECUTOR),
      /su propio rol/i);
  });

  await testAsync('nadie puede desactivarse a sí mismo', async () => {
    simular({});
    await assert.rejects(
      () => usuarios.cambiarActivo(10, false, EJECUTOR), /a sí mismo/i);
  });

  await testAsync('nadie puede quitarse su propio rol', async () => {
    simular({});
    await assert.rejects(() => usuarios.quitarRol(10, EJECUTOR), /su propio rol/i);
  });

  await testAsync('no se puede degradar al último administrador', async () => {
    // El usuario 20 es admin y no queda ningún otro.
    simular({ asignacion: { RolNombre: 'Administrador', PuedeAdministrar: true }, otrosAdmins: 0 });
    // Se fuerza el rol destino a uno sin administración.
    const cm = require('../src/db/connectionManager');
    cm.getConfigPool = async () => ({
      request: () => ({
        input() { return this; },
        query: async () => ({ recordset: [{ AppRolId: 2, Nombre: 'Lectura', PuedeAdministrar: false }] })
      })
    });
    await assert.rejects(
      () => usuarios.asignarRol({ codUsuarioICG: 20, appRolId: 2 }, EJECUTOR),
      /último administrador/i);
  });

  await testAsync('sí se puede degradar si queda otro administrador', async () => {
    simular({ asignacion: { RolNombre: 'Administrador', PuedeAdministrar: true }, otrosAdmins: 1 });
    const cm = require('../src/db/connectionManager');
    cm.getConfigPool = async () => ({
      request: () => ({
        input() { return this; },
        query: async () => ({ recordset: [{ AppRolId: 2, Nombre: 'Lectura', PuedeAdministrar: false }] })
      })
    });
    const r = await usuarios.asignarRol({ codUsuarioICG: 20, appRolId: 2 }, EJECUTOR);
    assert.strictEqual(r.rol, 'Lectura');
  });

  await testAsync('no se puede desactivar al último administrador', async () => {
    simular({ asignacion: { RolNombre: 'Administrador', PuedeAdministrar: true, LoginICG: 'X' },
      otrosAdmins: 0 });
    await assert.rejects(() => usuarios.cambiarActivo(20, false, EJECUTOR),
      /último administrador/i);
  });

  await testAsync('no se puede quitar el rol del último administrador', async () => {
    simular({ asignacion: { RolNombre: 'Administrador', PuedeAdministrar: true, LoginICG: 'X' },
      otrosAdmins: 0 });
    await assert.rejects(() => usuarios.quitarRol(20, EJECUTOR), /último administrador/i);
  });

  await testAsync('rol inexistente se rechaza', async () => {
    simular({});
    const cm = require('../src/db/connectionManager');
    cm.getConfigPool = async () => ({
      request: () => ({ input() { return this; }, query: async () => ({ recordset: [] }) })
    });
    await assert.rejects(() => usuarios.asignarRol({ codUsuarioICG: 20, appRolId: 99 }, EJECUTOR),
      /inexistente/i);
  });

  console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
  process.exit(fallos ? 1 : 0);
})();
