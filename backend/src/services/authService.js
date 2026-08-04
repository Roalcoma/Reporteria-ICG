'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const cfg = require('../config');
const { icgPassMatches } = require('./icgPassword');

class AuthError extends Error {}

/** 'LOCALHOST:CLARKS2025' -> { servidor:'LOCALHOST', baseDatos:'CLARKS2025' } */
function parsePathBd(pathbd) {
  if (!pathbd) return { servidor: null, baseDatos: null };
  const i = pathbd.indexOf(':');
  if (i < 0) return { servidor: null, baseDatos: pathbd };
  return { servidor: pathbd.slice(0, i), baseDatos: pathbd.slice(i + 1) };
}

/**
 * Autenticacion y autorizacion contra GENERAL de ICG (SOLO LECTURA) +
 * resolucion del rol de reporteria propio (BD de configuracion).
 */
class AuthService {
  /**
   * Login SOLO POR CONTRASENA (patron ICG: la clave identifica al usuario).
   * Verificado en la instalacion real: 309 usuarios activos con clave => 309
   * claves distintas (sin colisiones). Se excluyen los usuarios sin clave, de
   * lo contrario una clave vacia haria match multiple.
   * @returns {{codUsuario:number, usuario:string, email:string, appRol:object}}
   */
  async loginPorPassword(passwordPlano) {
    if (!passwordPlano) throw new AuthError('Contrasena requerida');

    const gpool = await cm.getGeneralPool();
    const { recordset } = await gpool.request()
      .query(`SELECT CODUSUARIO, USUARIO, NEWPASS, EMAIL
              FROM dbo.USUARIOS WITH(NOLOCK)
              WHERE ISNULL(DESCATALOGADO,'F') <> 'T'
                AND ISNULL(BLOQUEADO,'F')     <> 'T'
                AND NEWPASS IS NOT NULL AND NEWPASS <> ''`);

    const coincidencias = recordset.filter(u => icgPassMatches(passwordPlano, u.NEWPASS));
    if (coincidencias.length === 0) throw new AuthError('Contrasena incorrecta');
    if (coincidencias.length > 1) {
      // Salvaguarda: si algun dia se duplica una clave, no adivinamos el usuario.
      throw new AuthError('La contrasena esta duplicada en ICG; contacte al administrador');
    }

    const u = coincidencias[0];
    const appRol = await this.getAppRol(u.CODUSUARIO, u.USUARIO);
    return { codUsuario: u.CODUSUARIO, usuario: u.USUARIO, email: u.EMAIL, appRol };
  }

  /**
   * Rol de reporteria propio.
   *  - Los logins listados en ADMIN_LOGINS (.env) son SIEMPRE administradores:
   *    resuelve el arranque inicial y permite recuperar el acceso si la
   *    instalacion se quedara sin administradores.
   *  - Si el usuario no esta registrado, se le asigna 'Lectura' (solo ejecucion).
   */
  async getAppRol(codUsuarioICG, loginICG) {
    const esAdminBootstrap = cfg.adminLogins.includes(String(loginICG || '').toLowerCase());

    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('cod', sql.Int, codUsuarioICG)
      .query(`SELECT ua.UsuarioAppId, r.Nombre, r.PuedeCrear, r.PuedeEditar,
                     r.PuedeEjecutar, r.PuedeProgramar, r.PuedeAdministrar
              FROM rep.UsuarioApp ua
              JOIN rep.AppRol r ON r.AppRolId = ua.AppRolId
              WHERE ua.CodUsuarioICG = @cod AND ua.Activo = 1`);

    if (recordset[0]) {
      const rol = recordset[0];
      // El bootstrap eleva, nunca degrada.
      if (esAdminBootstrap) {
        return { ...rol, PuedeCrear: true, PuedeEditar: true, PuedeEjecutar: true,
          PuedeProgramar: true, PuedeAdministrar: true, EsAdminBootstrap: true };
      }
      return rol;
    }

    if (esAdminBootstrap) {
      return { UsuarioAppId: null, Nombre: 'Administrador', PuedeCrear: true,
        PuedeEditar: true, PuedeEjecutar: true, PuedeProgramar: true,
        PuedeAdministrar: true, EsAdminBootstrap: true, loginICG };
    }

    return { UsuarioAppId: null, Nombre: 'Lectura', PuedeCrear: false,
      PuedeEditar: false, PuedeEjecutar: true, PuedeProgramar: false,
      PuedeAdministrar: false, loginICG };
  }

  /** Empresas de GESTION a las que el usuario tiene permiso en ICG. */
  async getEmpresasGestion(codUsuario) {
    const gpool = await cm.getGeneralPool();
    const { recordset } = await gpool.request()
      .input('c', sql.Int, codUsuario)
      .query(`SELECT e.CODEMPRESA, e.TITULO, e.PATHBD
              FROM dbo.EMPRESASUSUARIO eu
              JOIN dbo.EMPRESAS e ON e.CODEMPRESA = eu.CODEMPRESA
              WHERE eu.CODUSUARIO = @c
              ORDER BY eu.POSICION`);
    return recordset.map(r => ({
      tipo: 'GESTION',
      codEmpresa: r.CODEMPRESA,
      nombre: r.TITULO,
      ...parsePathBd(r.PATHBD)
    }));
  }

  /**
   * Empresas CONTABLES (empresa + ejercicio) a las que el usuario tiene permiso.
   * @param {number} [codEmpGestion] si se indica, solo las contables asociadas a
   *   esa empresa de gestion (la que el usuario eligio al entrar).
   */
  async getEmpresasContables(codUsuario, codEmpGestion = null) {
    const gpool = await cm.getGeneralPool();
    const { recordset } = await gpool.request()
      .input('c', sql.Int, codUsuario)
      .input('g', sql.Int, codEmpGestion)
      .query(`SELECT ec.CODIGO, ec.EJERCICIO, ec.DESCRIPCION, ec.PATHBD, ecu.CODEMPGESTION
              FROM dbo.EMPRESASCONTAUSUARIO ecu
              JOIN dbo.EMPRESASCONTABLES ec
                ON ec.CODIGO = ecu.CODEMPRESA AND ec.EJERCICIO = ecu.EJERCICIO
              WHERE ecu.CODUSUARIO = @c
                AND (@g IS NULL OR ecu.CODEMPGESTION = @g)
              ORDER BY ecu.POSICION`);
    return recordset.map(r => ({
      tipo: 'CONTABLE',
      codEmpresa: r.CODIGO,
      ejercicio: r.EJERCICIO,
      codEmpGestion: r.CODEMPGESTION,
      nombre: r.DESCRIPCION,
      ...parsePathBd(r.PATHBD)
    }));
  }

  /**
   * Verifica que el usuario efectivamente tenga permiso sobre la empresa que
   * eligio antes de ejecutar (defensa contra manipulacion del cliente).
   */
  async assertEmpresaPermitida(codUsuario, area, codEmpresa, ejercicio) {
    const lista = area === 'CONTABLE'
      ? await this.getEmpresasContables(codUsuario)
      : await this.getEmpresasGestion(codUsuario);
    const ok = lista.find(e => e.codEmpresa === codEmpresa &&
      (area !== 'CONTABLE' || e.ejercicio === ejercicio));
    if (!ok) throw new AuthError('Sin permiso sobre la empresa seleccionada');
    return ok; // incluye { servidor, baseDatos }
  }
}

module.exports = { authService: new AuthService(), AuthError, parsePathBd };
