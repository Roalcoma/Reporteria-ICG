'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/**
 * Dashboards autogestionados por los usuarios.
 *
 * Visibilidad: PRIVADO (solo el autor), PERFIL (a los usuarios de ciertos
 * perfiles), USUARIOS (a personas concretas) o PUBLICO. El autor y los
 * administradores siempre pueden verlos y editarlos.
 */
class DashboardService {
  /** Dashboards que el usuario puede ver, con el motivo por el que los alcanza. */
  async listarVisibles(codUsuarioICG, esAdmin) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('c', sql.Int, codUsuarioICG)
      .input('admin', sql.Bit, esAdmin ? 1 : 0)
      .query(`
        SELECT d.DashboardId, d.Nombre, d.Descripcion, d.CodUsuarioICG, d.LoginICG,
               d.Visibilidad, d.Area, d.FechaCreacion, d.FechaActualizacion,
               CASE WHEN d.CodUsuarioICG = @c THEN 1 ELSE 0 END AS EsPropio,
               CASE
                 WHEN d.CodUsuarioICG = @c OR @admin = 1 THEN 1
                 WHEN EXISTS (SELECT 1 FROM rep.DashboardCompartido dc
                              WHERE dc.DashboardId = d.DashboardId
                                AND dc.CodUsuarioICG = @c AND dc.PuedeEditar = 1) THEN 1
                 ELSE 0
               END AS PuedeEditar
        FROM rep.Dashboard d
        WHERE d.Activo = 1
          AND (
            @admin = 1
            OR d.CodUsuarioICG = @c
            OR d.Visibilidad = 'PUBLICO'
            OR EXISTS (SELECT 1 FROM rep.DashboardCompartido dc
                       WHERE dc.DashboardId = d.DashboardId AND dc.CodUsuarioICG = @c)
            OR EXISTS (SELECT 1 FROM rep.DashboardCompartido dc
                       JOIN rep.UsuarioPerfil up ON up.PerfilId = dc.PerfilId
                       WHERE dc.DashboardId = d.DashboardId AND up.CodUsuarioICG = @c)
          )
        ORDER BY EsPropio DESC, d.Nombre`);
    return recordset;
  }

  async obtener(dashboardId, codUsuarioICG, esAdmin) {
    const visibles = await this.listarVisibles(codUsuarioICG, esAdmin);
    const permiso = visibles.find(d => d.DashboardId === dashboardId);
    if (!permiso) return null;                       // no existe o no lo alcanza

    const pool = await cm.getConfigPool();
    const rs = await pool.request().input('id', sql.Int, dashboardId).query(`
      SELECT * FROM rep.Dashboard WHERE DashboardId = @id;
      SELECT dc.CompartidoId, dc.PerfilId, p.Nombre AS PerfilNombre,
             dc.CodUsuarioICG, dc.LoginICG, dc.PuedeEditar
      FROM rep.DashboardCompartido dc
      LEFT JOIN rep.Perfil p ON p.PerfilId = dc.PerfilId
      WHERE dc.DashboardId = @id;`);
    const d = rs.recordsets[0][0];
    if (!d) return null;
    return {
      dashboard: { ...d, configuracion: JSON.parse(d.ConfiguracionJson) },
      compartidos: rs.recordsets[1],
      puedeEditar: !!permiso.PuedeEditar
    };
  }

  async crear({ nombre, descripcion, area, visibilidad, configuracion }, usuario) {
    if (!nombre || !nombre.trim()) {
      const e = new Error('El dashboard necesita un nombre'); e.status = 400; throw e;
    }
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('n', sql.NVarChar(150), nombre.trim())
      .input('d', sql.NVarChar(500), descripcion ?? null)
      .input('c', sql.Int, usuario.codUsuario)
      .input('l', sql.NVarChar(60), usuario.usuario)
      .input('a', sql.VarChar(10), (area || 'GESTION').toUpperCase())
      .input('v', sql.VarChar(10), visibilidad || 'PRIVADO')
      .input('cfg', sql.NVarChar(sql.MAX), JSON.stringify(configuracion || { widgets: [] }))
      .query(`INSERT INTO rep.Dashboard
              (Nombre, Descripcion, CodUsuarioICG, LoginICG, Area, Visibilidad, ConfiguracionJson)
              OUTPUT inserted.DashboardId
              VALUES (@n, @d, @c, @l, @a, @v, @cfg)`);
    return recordset[0].DashboardId;
  }

  /** Solo el autor, un administrador o alguien con permiso explícito puede guardar. */
  async actualizar(dashboardId, datos, usuario, esAdmin) {
    const actual = await this.obtener(dashboardId, usuario.codUsuario, esAdmin);
    if (!actual) { const e = new Error('Dashboard no encontrado'); e.status = 404; throw e; }
    if (!actual.puedeEditar) {
      const e = new Error('No tiene permiso para modificar este dashboard'); e.status = 403; throw e;
    }
    const pool = await cm.getConfigPool();
    await pool.request()
      .input('id', sql.Int, dashboardId)
      .input('n', sql.NVarChar(150), datos.nombre ?? actual.dashboard.Nombre)
      .input('d', sql.NVarChar(500), datos.descripcion ?? actual.dashboard.Descripcion)
      .input('v', sql.VarChar(10), datos.visibilidad ?? actual.dashboard.Visibilidad)
      .input('cfg', sql.NVarChar(sql.MAX),
        JSON.stringify(datos.configuracion ?? actual.dashboard.configuracion))
      .query(`UPDATE rep.Dashboard
              SET Nombre=@n, Descripcion=@d, Visibilidad=@v, ConfiguracionJson=@cfg,
                  FechaActualizacion=SYSDATETIME()
              WHERE DashboardId=@id`);
  }

  async eliminar(dashboardId, usuario, esAdmin) {
    const actual = await this.obtener(dashboardId, usuario.codUsuario, esAdmin);
    if (!actual) { const e = new Error('Dashboard no encontrado'); e.status = 404; throw e; }
    if (!esAdmin && actual.dashboard.CodUsuarioICG !== usuario.codUsuario) {
      const e = new Error('Solo el autor puede eliminar su dashboard'); e.status = 403; throw e;
    }
    const pool = await cm.getConfigPool();
    await pool.request().input('id', sql.Int, dashboardId)
      .query(`UPDATE rep.Dashboard SET Activo = 0 WHERE DashboardId = @id`);
  }

  /** Reemplaza con quién está compartido. */
  async compartir(dashboardId, { perfiles = [], usuarios = [] }, usuario, esAdmin) {
    const actual = await this.obtener(dashboardId, usuario.codUsuario, esAdmin);
    if (!actual) { const e = new Error('Dashboard no encontrado'); e.status = 404; throw e; }
    if (!esAdmin && actual.dashboard.CodUsuarioICG !== usuario.codUsuario) {
      const e = new Error('Solo el autor puede compartir su dashboard'); e.status = 403; throw e;
    }

    const pool = await cm.getConfigPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, dashboardId)
        .query(`DELETE FROM rep.DashboardCompartido WHERE DashboardId = @id`);
      for (const p of perfiles) {
        await new sql.Request(tx)
          .input('id', sql.Int, dashboardId)
          .input('p', sql.Int, p.perfilId ?? p)
          .input('e', sql.Bit, !!p.puedeEditar)
          .query(`INSERT INTO rep.DashboardCompartido (DashboardId, PerfilId, PuedeEditar)
                  VALUES (@id, @p, @e)`);
      }
      for (const u of usuarios) {
        await new sql.Request(tx)
          .input('id', sql.Int, dashboardId)
          .input('c', sql.Int, u.codUsuarioICG ?? u)
          .input('l', sql.NVarChar(60), u.login ?? null)
          .input('e', sql.Bit, !!u.puedeEditar)
          .query(`INSERT INTO rep.DashboardCompartido (DashboardId, CodUsuarioICG, LoginICG, PuedeEditar)
                  VALUES (@id, @c, @l, @e)`);
      }
      // La visibilidad refleja cómo se compartió.
      const vis = perfiles.length && usuarios.length ? 'USUARIOS'
        : perfiles.length ? 'PERFIL'
        : usuarios.length ? 'USUARIOS' : 'PRIVADO';
      await new sql.Request(tx)
        .input('id', sql.Int, dashboardId)
        .input('v', sql.VarChar(10), actual.dashboard.Visibilidad === 'PUBLICO' ? 'PUBLICO' : vis)
        .query(`UPDATE rep.Dashboard SET Visibilidad=@v WHERE DashboardId=@id`);
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }
}

module.exports = new DashboardService();
