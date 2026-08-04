'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/**
 * Perfiles de reporte: agrupan reportes y se asignan a usuarios.
 *
 * Modificar el perfil alcanza de inmediato a todos sus usuarios, que es
 * justamente lo que evita tener que asignar reporte por reporte y usuario por
 * usuario.
 *
 * Regla de visibilidad:
 *  - usuario SIN perfiles  -> ve todos los reportes (comportamiento previo);
 *  - usuario CON perfiles   -> solo los reportes de sus perfiles;
 *  - administradores        -> siempre ven todos.
 */
class PerfilService {
  async listar() {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(
      `SELECT p.PerfilId, p.Nombre, p.Descripcion, p.Activo, p.LoginCreador, p.FechaCreacion,
              (SELECT COUNT(*) FROM rep.PerfilReporte pr WHERE pr.PerfilId = p.PerfilId) AS Reportes,
              (SELECT COUNT(*) FROM rep.UsuarioPerfil up WHERE up.PerfilId = p.PerfilId) AS Usuarios
       FROM rep.Perfil p
       ORDER BY p.Nombre`);
    return recordset;
  }

  /** Perfil con sus reportes y usuarios asignados. */
  async obtener(perfilId) {
    const pool = await cm.getConfigPool();
    const rs = await pool.request().input('id', sql.Int, perfilId).query(`
      SELECT * FROM rep.Perfil WHERE PerfilId = @id;
      SELECT pr.ReporteId, r.Nombre, r.Tipo, r.Area
      FROM rep.PerfilReporte pr JOIN rep.Reporte r ON r.ReporteId = pr.ReporteId
      WHERE pr.PerfilId = @id AND r.Activo = 1 ORDER BY r.Nombre;
      SELECT CodUsuarioICG, LoginICG, FechaAsignacion
      FROM rep.UsuarioPerfil WHERE PerfilId = @id ORDER BY LoginICG;`);
    const [cab, reportes, usuarios] = rs.recordsets;
    if (!cab[0]) return null;
    return { perfil: cab[0], reportes, usuarios };
  }

  async crear({ nombre, descripcion }, usuario) {
    if (!nombre || !nombre.trim()) {
      const e = new Error('El nombre del perfil es obligatorio'); e.status = 400; throw e;
    }
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('n', sql.NVarChar(80), nombre.trim())
      .input('d', sql.NVarChar(300), descripcion ?? null)
      .input('uid', sql.Int, usuario?.appRol?.UsuarioAppId ?? null)
      .input('login', sql.NVarChar(60), usuario?.usuario ?? null)
      .query(`INSERT INTO rep.Perfil (Nombre, Descripcion, CreadoPor, LoginCreador)
              OUTPUT inserted.PerfilId VALUES (@n, @d, @uid, @login)`);
    return recordset[0].PerfilId;
  }

  async actualizar(perfilId, { nombre, descripcion, activo }) {
    const pool = await cm.getConfigPool();
    await pool.request()
      .input('id', sql.Int, perfilId)
      .input('n', sql.NVarChar(80), nombre)
      .input('d', sql.NVarChar(300), descripcion ?? null)
      .input('a', sql.Bit, activo === undefined ? 1 : !!activo)
      .query(`UPDATE rep.Perfil SET Nombre=@n, Descripcion=@d, Activo=@a WHERE PerfilId=@id`);
  }

  async eliminar(perfilId) {
    const pool = await cm.getConfigPool();
    // Las asignaciones caen en cascada por las FK.
    await pool.request().input('id', sql.Int, perfilId)
      .query(`DELETE FROM rep.Perfil WHERE PerfilId = @id`);
  }

  /** Reemplaza el conjunto de reportes del perfil. */
  async setReportes(perfilId, reporteIds) {
    const pool = await cm.getConfigPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, perfilId)
        .query(`DELETE FROM rep.PerfilReporte WHERE PerfilId = @id`);
      for (const rid of reporteIds || []) {
        await new sql.Request(tx)
          .input('p', sql.Int, perfilId).input('r', sql.Int, rid)
          .query(`INSERT INTO rep.PerfilReporte (PerfilId, ReporteId) VALUES (@p, @r)`);
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }

  /** Reemplaza el conjunto de perfiles de un usuario. */
  async setPerfilesDeUsuario(codUsuarioICG, perfilIds, loginICG, ejecutor) {
    const pool = await cm.getConfigPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('c', sql.Int, codUsuarioICG)
        .query(`DELETE FROM rep.UsuarioPerfil WHERE CodUsuarioICG = @c`);
      for (const pid of perfilIds || []) {
        await new sql.Request(tx)
          .input('c', sql.Int, codUsuarioICG)
          .input('p', sql.Int, pid)
          .input('l', sql.NVarChar(60), loginICG ?? null)
          .input('a', sql.NVarChar(60), ejecutor?.usuario ?? null)
          .query(`INSERT INTO rep.UsuarioPerfil (CodUsuarioICG, PerfilId, LoginICG, AsignadoPor)
                  VALUES (@c, @p, @l, @a)`);
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }

  async getPerfilesDeUsuario(codUsuarioICG) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('c', sql.Int, codUsuarioICG)
      .query(`SELECT p.PerfilId, p.Nombre, p.Activo
              FROM rep.UsuarioPerfil up
              JOIN rep.Perfil p ON p.PerfilId = up.PerfilId
              WHERE up.CodUsuarioICG = @c ORDER BY p.Nombre`);
    return recordset;
  }

  /**
   * Ids de reporte visibles para el usuario, o null si debe verlos todos
   * (administrador, o usuario sin ningún perfil asignado).
   */
  async getReportesVisibles(codUsuarioICG, esAdmin) {
    if (esAdmin) return null;
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('c', sql.Int, codUsuarioICG)
      .query(`SELECT COUNT(*) AS n FROM rep.UsuarioPerfil up
              JOIN rep.Perfil p ON p.PerfilId = up.PerfilId AND p.Activo = 1
              WHERE up.CodUsuarioICG = @c`);
    if (!recordset[0].n) return null;   // sin perfiles: ve todo

    const { recordset: ids } = await pool.request()
      .input('c', sql.Int, codUsuarioICG)
      .query(`SELECT ReporteId FROM rep.vw_ReportesPorUsuario WHERE CodUsuarioICG = @c`);
    return new Set(ids.map(r => r.ReporteId));
  }
}

module.exports = new PerfilService();
