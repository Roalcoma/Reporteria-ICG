'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const cfg = require('../config');

/**
 * Administración de los usuarios de la aplicación.
 *
 * Los usuarios NO se crean aquí: viven en GENERAL.USUARIOS de ICG (solo lectura).
 * Lo que se administra es el ROL de reportería que cada uno tiene, guardado en
 * rep.UsuarioApp. Quien no esté registrado entra como 'Lectura'.
 */
class UsuarioService {
  /** Roles disponibles. */
  async listarRoles() {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(
      `SELECT AppRolId, Nombre, PuedeCrear, PuedeEditar, PuedeEjecutar,
              PuedeProgramar, PuedeAdministrar, Activo
       FROM rep.AppRol WHERE Activo = 1 ORDER BY PuedeAdministrar DESC, Nombre`);
    return recordset;
  }

  /**
   * Usuarios de ICG con el rol que tengan asignado en la app.
   * Se consultan dos bases distintas y se combinan en memoria: no se asume que
   * GENERAL y la BD de configuración estén en la misma instancia.
   */
  async listarUsuarios({ soloAsignados = false, filtro = '' } = {}) {
    const gpool = await cm.getGeneralPool();
    const greq = gpool.request();
    let where = `ISNULL(DESCATALOGADO,'F') <> 'T'`;
    if (filtro) { greq.input('f', sql.NVarChar(60), `%${filtro}%`); where += ' AND USUARIO LIKE @f'; }
    const { recordset: icg } = await greq.query(
      `SELECT CODUSUARIO, USUARIO, EMAIL, BLOQUEADO,
              CASE WHEN NEWPASS IS NULL OR NEWPASS = '' THEN 0 ELSE 1 END AS TieneClave
       FROM dbo.USUARIOS WITH(NOLOCK)
       WHERE ${where}
       ORDER BY USUARIO`);

    const pool = await cm.getConfigPool();
    const { recordset: app } = await pool.request().query(
      `SELECT ua.UsuarioAppId, ua.CodUsuarioICG, ua.LoginICG, ua.Activo,
              ua.AppRolId, r.Nombre AS RolNombre, r.PuedeAdministrar
       FROM rep.UsuarioApp ua
       JOIN rep.AppRol r ON r.AppRolId = ua.AppRolId`);
    const porCod = new Map(app.map(a => [a.CodUsuarioICG, a]));

    const admins = cfg.adminLogins;
    const lista = icg.map(u => {
      const a = porCod.get(u.CODUSUARIO);
      return {
        codUsuarioICG: u.CODUSUARIO,
        login: u.USUARIO,
        email: u.EMAIL,
        bloqueado: u.BLOQUEADO === 'T',
        // Sin clave no puede entrar: el login es solo por contraseña.
        puedeIniciarSesion: !!u.TieneClave && u.BLOQUEADO !== 'T',
        usuarioAppId: a?.UsuarioAppId ?? null,
        appRolId: a?.AppRolId ?? null,
        rol: a?.RolNombre ?? null,          // null = 'Lectura' por defecto
        activo: a ? !!a.Activo : null,
        esAdminBootstrap: admins.includes(String(u.USUARIO || '').toLowerCase())
      };
    });
    return soloAsignados ? lista.filter(u => u.usuarioAppId != null || u.esAdminBootstrap) : lista;
  }

  /** Cuántos administradores activos hay registrados (sin contar el bootstrap). */
  async contarAdministradores(excluyendoCodUsuario = null) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('ex', sql.Int, excluyendoCodUsuario)
      .query(`SELECT COUNT(*) AS Total
              FROM rep.UsuarioApp ua
              JOIN rep.AppRol r ON r.AppRolId = ua.AppRolId
              WHERE ua.Activo = 1 AND r.PuedeAdministrar = 1
                AND (@ex IS NULL OR ua.CodUsuarioICG <> @ex)`);
    return recordset[0].Total;
  }

  /**
   * Asigna (o cambia) el rol de un usuario de ICG.
   * Salvaguardas:
   *  - nadie puede cambiar su propio rol (evita auto-promoción y auto-bloqueo);
   *  - no se puede retirar el último administrador registrado.
   */
  async asignarRol({ codUsuarioICG, login, appRolId }, ejecutor) {
    if (ejecutor && ejecutor.codUsuario === codUsuarioICG) {
      const e = new Error('No puede cambiar su propio rol. Pídaselo a otro administrador.');
      e.status = 400; throw e;
    }

    const pool = await cm.getConfigPool();
    const { recordset: roles } = await pool.request()
      .input('rid', sql.Int, appRolId)
      .query(`SELECT AppRolId, Nombre, PuedeAdministrar FROM rep.AppRol
              WHERE AppRolId = @rid AND Activo = 1`);
    const rolNuevo = roles[0];
    if (!rolNuevo) { const e = new Error('Rol inexistente'); e.status = 400; throw e; }

    const previo = await this._getAsignacion(codUsuarioICG);
    // Si este usuario era el último administrador y se le baja el rol, se impide.
    if (previo?.PuedeAdministrar && !rolNuevo.PuedeAdministrar) {
      const otros = await this.contarAdministradores(codUsuarioICG);
      if (otros === 0) {
        const e = new Error(
          'Es el último administrador registrado. Asigne otro administrador antes de cambiar este rol.');
        e.status = 409; throw e;
      }
    }

    await pool.request()
      .input('cod', sql.Int, codUsuarioICG)
      .input('login', sql.NVarChar(60), login ?? previo?.LoginICG ?? null)
      .input('rid', sql.Int, appRolId)
      .query(`
        IF EXISTS (SELECT 1 FROM rep.UsuarioApp WHERE CodUsuarioICG = @cod)
          UPDATE rep.UsuarioApp
          SET AppRolId = @rid, Activo = 1, LoginICG = ISNULL(@login, LoginICG)
          WHERE CodUsuarioICG = @cod;
        ELSE
          INSERT INTO rep.UsuarioApp (CodUsuarioICG, LoginICG, AppRolId)
          VALUES (@cod, @login, @rid);`);

    await this._historial({
      codUsuarioICG, login, rolAnterior: previo?.RolNombre ?? null,
      rolNuevo: rolNuevo.Nombre, accion: previo ? 'CAMBIAR' : 'ASIGNAR', ejecutor
    });
    return { rol: rolNuevo.Nombre };
  }

  /** Activa o desactiva el acceso de un usuario (sin borrar su asignación). */
  async cambiarActivo(codUsuarioICG, activo, ejecutor) {
    if (ejecutor && ejecutor.codUsuario === codUsuarioICG) {
      const e = new Error('No puede desactivarse a sí mismo.'); e.status = 400; throw e;
    }
    const previo = await this._getAsignacion(codUsuarioICG);
    if (!previo) { const e = new Error('El usuario no tiene rol asignado'); e.status = 404; throw e; }

    if (previo.PuedeAdministrar && !activo && await this.contarAdministradores(codUsuarioICG) === 0) {
      const e = new Error('Es el último administrador activo; no puede desactivarse.');
      e.status = 409; throw e;
    }

    const pool = await cm.getConfigPool();
    await pool.request()
      .input('cod', sql.Int, codUsuarioICG)
      .input('a', sql.Bit, !!activo)
      .query(`UPDATE rep.UsuarioApp SET Activo = @a WHERE CodUsuarioICG = @cod`);

    await this._historial({
      codUsuarioICG, login: previo.LoginICG, rolAnterior: previo.RolNombre,
      rolNuevo: previo.RolNombre, accion: activo ? 'ACTIVAR' : 'DESACTIVAR', ejecutor
    });
  }

  /** Quita la asignación: el usuario vuelve al rol 'Lectura' por defecto. */
  async quitarRol(codUsuarioICG, ejecutor) {
    if (ejecutor && ejecutor.codUsuario === codUsuarioICG) {
      const e = new Error('No puede quitarse su propio rol.'); e.status = 400; throw e;
    }
    const previo = await this._getAsignacion(codUsuarioICG);
    if (!previo) return;
    if (previo.PuedeAdministrar && await this.contarAdministradores(codUsuarioICG) === 0) {
      const e = new Error('Es el último administrador registrado; asigne otro primero.');
      e.status = 409; throw e;
    }
    const pool = await cm.getConfigPool();
    await pool.request().input('cod', sql.Int, codUsuarioICG)
      .query(`DELETE FROM rep.UsuarioApp WHERE CodUsuarioICG = @cod`);

    await this._historial({
      codUsuarioICG, login: previo.LoginICG, rolAnterior: previo.RolNombre,
      rolNuevo: null, accion: 'QUITAR', ejecutor
    });
  }

  /** Historial de cambios de rol (auditoría específica). */
  async historial(codUsuarioICG = null, top = 200) {
    const pool = await cm.getConfigPool();
    const req = pool.request().input('top', sql.Int, Math.min(Number(top) || 200, 500));
    const where = codUsuarioICG
      ? (req.input('cod', sql.Int, codUsuarioICG), 'WHERE CodUsuarioICG = @cod') : '';
    const { recordset } = await req.query(
      `SELECT TOP (@top) * FROM rep.UsuarioRolHistorial ${where} ORDER BY FechaCambio DESC`);
    return recordset;
  }

  async _getAsignacion(codUsuarioICG) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('cod', sql.Int, codUsuarioICG)
      .query(`SELECT ua.UsuarioAppId, ua.LoginICG, ua.Activo, r.Nombre AS RolNombre,
                     r.PuedeAdministrar
              FROM rep.UsuarioApp ua
              JOIN rep.AppRol r ON r.AppRolId = ua.AppRolId
              WHERE ua.CodUsuarioICG = @cod`);
    return recordset[0] || null;
  }

  async _historial({ codUsuarioICG, login, rolAnterior, rolNuevo, accion, ejecutor }) {
    try {
      const pool = await cm.getConfigPool();
      await pool.request()
        .input('cod', sql.Int, codUsuarioICG)
        .input('login', sql.NVarChar(60), login ?? null)
        .input('ant', sql.NVarChar(60), rolAnterior ?? null)
        .input('nue', sql.NVarChar(60), rolNuevo ?? null)
        .input('acc', sql.VarChar(12), accion)
        .input('eid', sql.Int, ejecutor?.appRol?.UsuarioAppId ?? null)
        .input('elogin', sql.NVarChar(60), ejecutor?.usuario ?? null)
        .query(`INSERT INTO rep.UsuarioRolHistorial
                (CodUsuarioICG, LoginICG, RolAnterior, RolNuevo, Accion, EjecutadoPor, LoginEjecutor)
                VALUES (@cod, @login, @ant, @nue, @acc, @eid, @elogin)`);
    } catch (e) {
      console.error('No se pudo registrar el historial de rol:', e.message);
    }
  }
}

module.exports = new UsuarioService();
