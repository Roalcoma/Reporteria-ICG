'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');

/**
 * Historial de versiones de un reporte: guarda un snapshot completo de la
 * definición en cada cambio y permite comparar dos puntos en el tiempo.
 * La historia NO tiene FK a rep.Reporte: sobrevive al borrado del reporte.
 */
class VersionService {
  /**
   * Guarda un snapshot.
   * @param {object} p { reporteId, version, accion, definicion, nombreReporte, comentario, usuario }
   */
  async guardar(p) {
    try {
      const pool = await cm.getConfigPool();
      const u = p.usuario || {};
      await pool.request()
        .input('rid', sql.Int, p.reporteId)
        .input('ver', sql.Int, p.version ?? 1)
        .input('acc', sql.VarChar(12), p.accion)
        .input('def', sql.NVarChar(sql.MAX), JSON.stringify(p.definicion ?? {}))
        .input('nom', sql.NVarChar(150), p.nombreReporte ?? null)
        .input('com', sql.NVarChar(400), p.comentario ?? null)
        .input('uapp', sql.Int, (u.appRol && u.appRol.UsuarioAppId) ?? null)
        .input('cod', sql.Int, u.codUsuario ?? null)
        .input('login', sql.NVarChar(60), u.usuario ?? null)
        .query(`INSERT INTO rep.ReporteVersion
                (ReporteId,Version,Accion,DefinicionJson,NombreReporte,Comentario,
                 UsuarioAppId,CodUsuarioICG,LoginICG)
                VALUES (@rid,@ver,@acc,@def,@nom,@com,@uapp,@cod,@login)`);
    } catch (e) {
      console.error('Versionado: no se pudo guardar el snapshot', e.message);
    }
  }

  /** Línea de tiempo de un reporte (sin el JSON completo, para listar). */
  async historial(reporteId) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('rid', sql.Int, reporteId)
      .query(`SELECT ReporteVersionId, Version, Accion, NombreReporte, Comentario,
                     LoginICG, CodUsuarioICG, FechaCambio,
                     DATALENGTH(DefinicionJson) AS TamanoBytes
              FROM rep.ReporteVersion
              WHERE ReporteId = @rid
              ORDER BY FechaCambio DESC`);
    return recordset;
  }

  /** Devuelve una versión concreta con su definición completa. */
  async obtener(reporteVersionId) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('id', sql.BigInt, reporteVersionId)
      .query(`SELECT * FROM rep.ReporteVersion WHERE ReporteVersionId = @id`);
    const v = recordset[0];
    if (!v) return null;
    return { ...v, definicion: JSON.parse(v.DefinicionJson) };
  }

  /**
   * Compara dos versiones y describe qué cambió: SQL de cada consulta,
   * parámetros añadidos/eliminados/modificados y campos del reporte.
   */
  async comparar(versionIdA, versionIdB) {
    const [a, b] = await Promise.all([this.obtener(versionIdA), this.obtener(versionIdB)]);
    if (!a || !b) { const e = new Error('Versión no encontrada'); e.status = 404; throw e; }

    const da = a.definicion, db = b.definicion;
    const cambios = [];

    // --- Campos del reporte ---
    for (const campo of ['Nombre', 'Descripcion', 'Tipo', 'Area', 'CarpetaId']) {
      const va = da.reporte?.[campo], vb = db.reporte?.[campo];
      if (String(va ?? '') !== String(vb ?? '')) {
        cambios.push({ ambito: 'REPORTE', clave: campo, antes: va ?? null, despues: vb ?? null });
      }
    }

    // --- Consultas SQL ---
    const roles = new Set([...(da.consultas || []).map(c => c.Rol),
                           ...(db.consultas || []).map(c => c.Rol)]);
    for (const rol of roles) {
      const ca = (da.consultas || []).find(c => c.Rol === rol);
      const cb = (db.consultas || []).find(c => c.Rol === rol);
      if ((ca?.SqlText ?? '') !== (cb?.SqlText ?? '')) {
        cambios.push({
          ambito: 'SQL', clave: rol,
          antes: ca?.SqlText ?? null, despues: cb?.SqlText ?? null,
          diff: diffLineas(ca?.SqlText ?? '', cb?.SqlText ?? '')
        });
      }
    }

    // --- Parámetros ---
    const nombresA = new Map((da.parametros || []).map(p => [p.Nombre, p]));
    const nombresB = new Map((db.parametros || []).map(p => [p.Nombre, p]));
    for (const [nombre, pb] of nombresB) {
      const pa = nombresA.get(nombre);
      if (!pa) {
        cambios.push({ ambito: 'PARAMETRO', clave: nombre, antes: null, despues: 'añadido' });
      } else {
        for (const c of ['TipoDato', 'ControlUI', 'Clase', 'Obligatorio', 'PermiteMultiple', 'Etiqueta']) {
          if (String(pa[c] ?? '') !== String(pb[c] ?? '')) {
            cambios.push({ ambito: 'PARAMETRO', clave: `${nombre}.${c}`,
              antes: pa[c] ?? null, despues: pb[c] ?? null });
          }
        }
      }
    }
    for (const nombre of nombresA.keys()) {
      if (!nombresB.has(nombre)) {
        cambios.push({ ambito: 'PARAMETRO', clave: nombre, antes: 'existía', despues: null });
      }
    }

    return {
      a: { id: a.ReporteVersionId, version: a.Version, fecha: a.FechaCambio, usuario: a.LoginICG, accion: a.Accion },
      b: { id: b.ReporteVersionId, version: b.Version, fecha: b.FechaCambio, usuario: b.LoginICG, accion: b.Accion },
      cambios
    };
  }
}

/** Diff sencillo por líneas: marca las añadidas (+) y eliminadas (-). */
function diffLineas(textoA, textoB) {
  const a = textoA.split('\n'), b = textoB.split('\n');
  const setA = new Set(a.map(s => s.trim())), setB = new Set(b.map(s => s.trim()));
  const salida = [];
  for (const linea of a) if (!setB.has(linea.trim())) salida.push({ tipo: '-', texto: linea });
  for (const linea of b) if (!setA.has(linea.trim())) salida.push({ tipo: '+', texto: linea });
  return salida;
}

module.exports = new VersionService();
