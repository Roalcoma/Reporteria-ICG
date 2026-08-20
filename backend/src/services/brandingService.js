'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/** Tipos de imagen admitidos para el logo. */
const MIME_OK = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB

/**
 * Identidad corporativa por empresa: logo + encabezado + pie institucional.
 * Vive en la BD de configuración aislada (rep.Empresa + rep.EmpresaBranding);
 * nunca se escribe nada en las bases de ICG.
 */
class BrandingService {
  /**
   * Devuelve (creando si hace falta) el EmpresaId local para una empresa de ICG.
   * rep.Empresa es un registro propio: las empresas viven en ICG, aquí solo se
   * referencian para poder colgarles branding.
   */
  async _resolverEmpresaId({ codigoICG, tipo, ejercicio = null, nombre = null }) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('cod', sql.Int, codigoICG)
      .input('tipo', sql.VarChar(10), tipo)
      .input('ej', sql.Int, ejercicio)
      .input('nom', sql.NVarChar(200), nombre)
      .query(`
        DECLARE @id INT;
        SELECT @id = EmpresaId FROM rep.Empresa
        WHERE CodigoICG = @cod AND Tipo = @tipo
          AND ((Ejercicio IS NULL AND @ej IS NULL) OR Ejercicio = @ej);
        IF @id IS NULL
        BEGIN
          INSERT INTO rep.Empresa (CodigoICG, Ejercicio, Tipo, Nombre)
          VALUES (@cod, @ej, @tipo, @nom);
          SET @id = SCOPE_IDENTITY();
        END
        ELSE IF @nom IS NOT NULL
          UPDATE rep.Empresa SET Nombre = @nom WHERE EmpresaId = @id;
        SELECT @id AS EmpresaId;`);
    return recordset[0].EmpresaId;
  }

  /**
   * Branding listo para inyectar en la exportación.
   * @param {number} codigoICG @param {'GESTION'|'CONTABLE'} tipo @param {number} [ejercicio]
   */
  async getBranding(codigoICG, tipo, ejercicio = null) {
    try {
      const pool = await cm.getConfigPool();
      const { recordset } = await pool.request()
        .input('cod', sql.Int, codigoICG)
        .input('tipo', sql.VarChar(10), tipo)
        .input('ej', sql.Int, ejercicio)
        .query(`SELECT TOP 1 e.Nombre, b.LogoImagen, b.LogoMime, b.EncabezadoHtml, b.PieHtml
                FROM rep.Empresa e
                JOIN rep.EmpresaBranding b ON b.EmpresaId = e.EmpresaId AND b.Activo = 1
                WHERE e.CodigoICG = @cod AND e.Tipo = @tipo
                  AND (@ej IS NULL OR e.Ejercicio IS NULL OR e.Ejercicio = @ej)`);
      const b = recordset[0];
      if (!b) return { nombre: '', logoDataUri: null, encabezadoHtml: '', pieHtml: '' };
      return {
        nombre: b.Nombre || '',
        logoDataUri: b.LogoImagen
          ? `data:${b.LogoMime || 'image/png'};base64,${Buffer.from(b.LogoImagen).toString('base64')}`
          : null,
        encabezadoHtml: b.EncabezadoHtml || '',
        pieHtml: b.PieHtml || ''
      };
    } catch {
      // ponytail: tablas de branding aún no migradas → sin branding, no falla la exportación
      return { nombre: '', logoDataUri: null, encabezadoHtml: '', pieHtml: '' };
    }
  }

  /**
   * Crea o actualiza el branding de una empresa.
   * El logo llega como data URI (`data:image/png;base64,...`) para no requerir
   * multipart; se valida tipo y tamaño antes de persistirlo como VARBINARY.
   */
  async guardar({ codigoICG, tipo, ejercicio, nombre, logoDataUri, encabezadoHtml, pieHtml }) {
    let logoBuffer = null, logoMime = null;
    if (logoDataUri) {
      const m = /^data:([^;]+);base64,(.+)$/s.exec(logoDataUri);
      if (!m) { const e = new Error('Formato de imagen inválido'); e.status = 400; throw e; }
      logoMime = m[1].toLowerCase();
      if (!MIME_OK.includes(logoMime)) {
        const e = new Error(`Tipo de imagen no admitido: ${logoMime}`); e.status = 400; throw e;
      }
      logoBuffer = Buffer.from(m[2], 'base64');
      if (logoBuffer.length > MAX_LOGO_BYTES) {
        const e = new Error('El logo supera 1 MB'); e.status = 400; throw e;
      }
    }

    const empresaId = await this._resolverEmpresaId({ codigoICG, tipo, ejercicio, nombre });
    const pool = await cm.getConfigPool();
    const req = pool.request()
      .input('eid', sql.Int, empresaId)
      .input('enc', sql.NVarChar(sql.MAX), encabezadoHtml ?? null)
      .input('pie', sql.NVarChar(sql.MAX), pieHtml ?? null)
      .input('mime', sql.NVarChar(50), logoMime)
      .input('logo', sql.VarBinary(sql.MAX), logoBuffer);

    // Si no se envía logo nuevo, se conserva el existente.
    await req.query(`
      IF EXISTS (SELECT 1 FROM rep.EmpresaBranding WHERE EmpresaId = @eid)
        UPDATE rep.EmpresaBranding
        SET EncabezadoHtml = @enc,
            PieHtml = @pie,
            LogoImagen = CASE WHEN @logo IS NULL THEN LogoImagen ELSE @logo END,
            LogoMime   = CASE WHEN @logo IS NULL THEN LogoMime   ELSE @mime END,
            Activo = 1,
            FechaActualizacion = SYSDATETIME()
        WHERE EmpresaId = @eid;
      ELSE
        INSERT INTO rep.EmpresaBranding (EmpresaId, LogoImagen, LogoMime, EncabezadoHtml, PieHtml)
        VALUES (@eid, @logo, @mime, @enc, @pie);`);
    return { empresaId };
  }

  /** Quita solo el logo, conservando encabezado y pie. */
  async eliminarLogo(codigoICG, tipo, ejercicio = null) {
    const pool = await cm.getConfigPool();
    await pool.request()
      .input('cod', sql.Int, codigoICG)
      .input('tipo', sql.VarChar(10), tipo)
      .input('ej', sql.Int, ejercicio)
      .query(`UPDATE b SET b.LogoImagen = NULL, b.LogoMime = NULL,
                           b.FechaActualizacion = SYSDATETIME()
              FROM rep.EmpresaBranding b
              JOIN rep.Empresa e ON e.EmpresaId = b.EmpresaId
              WHERE e.CodigoICG = @cod AND e.Tipo = @tipo
                AND ((e.Ejercicio IS NULL AND @ej IS NULL) OR e.Ejercicio = @ej)`);
  }

  /** Lista las empresas que ya tienen branding configurado. */
  async listar() {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(
      `SELECT e.EmpresaId, e.CodigoICG, e.Tipo, e.Ejercicio, e.Nombre,
              CASE WHEN b.LogoImagen IS NULL THEN 0 ELSE 1 END AS TieneLogo,
              b.LogoMime, b.FechaActualizacion,
              CASE WHEN b.EncabezadoHtml IS NULL OR b.EncabezadoHtml = '' THEN 0 ELSE 1 END AS TieneEncabezado
       FROM rep.Empresa e
       JOIN rep.EmpresaBranding b ON b.EmpresaId = e.EmpresaId AND b.Activo = 1
       ORDER BY e.Tipo, e.CodigoICG`);
    return recordset;
  }

  /** Devuelve el branding en crudo para editarlo en la UI. */
  async getParaEditar(codigoICG, tipo, ejercicio = null) {
    const b = await this.getBranding(codigoICG, tipo, ejercicio);
    return b;
  }
}

module.exports = new BrandingService();
module.exports.MIME_OK = MIME_OK;
module.exports.MAX_LOGO_BYTES = MAX_LOGO_BYTES;
