'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const repo = require('./reporteRepository');
const procedimientos = require('./procedimientoService');
const { revisarSql } = require('../engine/sqlGuard');

/**
 * Portabilidad de reportes entre instalaciones/clientes: serializa la definición
 * completa a un objeto JSON limpio (sin IDs internos) e importa desde ese JSON.
 *
 * QUÉ NO VIAJA, y es lo importante: ni datos, ni credenciales, ni identificadores
 * internos. Un archivo exportado describe CÓMO se construye el reporte, no lo que
 * devuelve. Puede enviarse a otro cliente sin filtrar información de negocio.
 *
 * ANALIZAR ANTES DE IMPORTAR. `analizar()` revisa el archivo sin guardar nada y
 * separa dos niveles:
 *   ERROR  (bloquea)    formato desconocido, sin consultas, SQL que no pasa la
 *                       guarda, o —el caso típico al migrar— un procedimiento
 *                       almacenado que el cliente de origen tenía autorizado y
 *                       este no. Se resuelve autorizándolo en la lista blanca,
 *                       NUNCA relajando la validación.
 *   AVISO  (no bloquea) ya existe un reporte activo con ese nombre.
 *
 * El SQL importado pasa por la MISMA guarda que el escrito a mano, de modo que
 * un archivo manipulado no puede introducir sentencias destructivas. Importar no
 * es una vía de confianza.
 *
 * El marcador de versión permite que una instalación futura reconozca formatos
 * antiguos: al cambiar la estructura, suba la versión y acepte también la previa
 * en lugar de romper los archivos ya distribuidos.
 */
const FORMATO = 'icg-reporteria/v1';

class PortabilidadService {
  /** Exporta la definición de un reporte a un objeto JSON portable. */
  async exportar(reporteId, usuarioAppId) {
    const def = await repo.getReporteFull(reporteId);
    if (!def) { const e = new Error('Reporte no encontrado'); e.status = 404; throw e; }

    const limpio = {
      formato: FORMATO,
      reporte: pick(def.reporte,
        ['Nombre', 'Descripcion', 'Tipo', 'Area', 'OrientacionPdf', 'TamanoHoja']),
      consultas: def.consultas.map(c =>
        pick(c, ['Rol', 'SqlText', 'CampoVinculoCabecera', 'CampoVinculoDetalle', 'Orden'])),
      parametros: def.parametros.map(p => ({
        ...pick(p, ['Nombre','Etiqueta','TipoDato','Clase','ControlUI','Obligatorio',
          'PermiteMultiple','ValorDefault','Precision','Escala','SqlOrigen','CampoValor','CampoTexto','Orden']),
        opciones: p.opciones.map(o => pick(o, ['Valor', 'Texto', 'Orden']))
      })),
      columnas: def.columnas.map(c =>
        pick(c, ['ConsultaRol','NombreCampo','AliasVisible','Formato','FormatoPatron',
          'VisiblePorDefecto','EsAdicional','EsAgrupable','AgregacionPie','Orden']))
    };
    await this._log('EXPORT', reporteId, def.reporte.Nombre, usuarioAppId);
    return limpio;
  }

  /**
   * Revisa un bundle SIN guardarlo: resume su contenido y detecta problemas
   * antes de importar. Es la comprobación clave al migrar entre clientes,
   * donde un reporte puede traer SQL que aquí no pasa la guarda (por ejemplo,
   * un procedimiento almacenado que en esta instalación no está autorizado).
   */
  async analizar(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      const e = new Error('El archivo no contiene una definición válida'); e.status = 400; throw e;
    }
    if (bundle.formato !== FORMATO) {
      const e = new Error(
        `Formato desconocido${bundle.formato ? ` ("${bundle.formato}")` : ''}. ` +
        `Se esperaba "${FORMATO}".`);
      e.status = 400; throw e;
    }

    const opciones = { procedimientosPermitidos: await procedimientos.getPermitidos() };
    const problemas = [];

    if (!bundle.reporte?.Nombre) problemas.push({ nivel: 'ERROR', mensaje: 'El reporte no tiene nombre.' });
    if (!(bundle.consultas || []).length) problemas.push({ nivel: 'ERROR', mensaje: 'No trae ninguna consulta.' });

    for (const c of bundle.consultas || []) {
      const r = revisarSql(c.SqlText, `La consulta ${c.Rol}`, opciones);
      if (!r.valida) problemas.push({ nivel: 'ERROR', mensaje: r.error, motivo: r.motivo, rol: c.Rol });
    }
    for (const p of bundle.parametros || []) {
      if (p.ControlUI === 'LISTA_SQL' && p.SqlOrigen) {
        const r = revisarSql(p.SqlOrigen, `El origen del parámetro ${p.Nombre}`, opciones);
        if (!r.valida) problemas.push({ nivel: 'ERROR', mensaje: r.error, motivo: r.motivo });
      }
    }

    // El nombre repetido no impide importar, pero conviene avisarlo.
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('n', sql.NVarChar(150), bundle.reporte?.Nombre || '')
      .query(`SELECT ReporteId FROM rep.Reporte WHERE Nombre = @n AND Activo = 1`);
    if (recordset.length) {
      problemas.push({ nivel: 'AVISO',
        mensaje: `Ya existe un reporte activo llamado "${bundle.reporte.Nombre}". Se creará otro aparte.` });
    }

    return {
      valido: !problemas.some(p => p.nivel === 'ERROR'),
      resumen: {
        nombre: bundle.reporte?.Nombre,
        descripcion: bundle.reporte?.Descripcion,
        tipo: bundle.reporte?.Tipo,
        area: bundle.reporte?.Area,
        consultas: (bundle.consultas || []).map(c => c.Rol),
        parametros: (bundle.parametros || []).map(p => p.Nombre),
        columnas: (bundle.columnas || []).length
      },
      problemas
    };
  }

  /** Importa una definición portable creando un nuevo reporte. */
  async importar(bundle, carpetaId, usuarioAppId) {
    if (!bundle || bundle.formato !== FORMATO) {
      const e = new Error('Archivo de definición inválido o de otra versión'); e.status = 400; throw e;
    }
    const def = {
      reporte: { ...bundle.reporte, CarpetaId: carpetaId ?? null },
      consultas: bundle.consultas || [],
      parametros: bundle.parametros || [],
      columnas: bundle.columnas || []
    };
    const nuevoId = await repo.crearReporte(def, usuarioAppId);
    await this._log('IMPORT', nuevoId, bundle.reporte?.Nombre, usuarioAppId);
    return nuevoId;
  }

  async _log(accion, reporteId, nombre, usuarioAppId) {
    const pool = await cm.getConfigPool();
    await pool.request()
      .input('a', sql.VarChar(8), accion)
      .input('r', sql.Int, reporteId ?? null)
      .input('n', sql.NVarChar(150), nombre ?? null)
      .input('u', sql.Int, usuarioAppId ?? null)
      .query(`INSERT INTO rep.PortabilidadLog (Accion, ReporteId, NombreReporte, UsuarioAppId)
              VALUES (@a, @r, @n, @u)`);
  }
}

const pick = (obj, keys) => keys.reduce((a, k) => (obj[k] !== undefined && (a[k] = obj[k]), a), {});

module.exports = new PortabilidadService();
