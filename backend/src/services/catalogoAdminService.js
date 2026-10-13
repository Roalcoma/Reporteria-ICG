'use strict';
const sql = require('mssql');
const cm = require('../db/connectionManager');
const catalogo = require('./catalogoService');
const { authService } = require('./authService');
const { validarSqlReporte } = require('../engine/sqlGuard');

const IDENT = /^[A-Z][A-Z0-9_]*$/;   // claves lógicas en mayúsculas

/**
 * Administración del catálogo semántico.
 *
 * Los orígenes con Paquete = 'ICG-BASE' los publicamos nosotros y son de solo
 * lectura: así podemos seguir corrigiéndolos sin pisar personalizaciones. Para
 * variarlos se duplican, y la copia nace como origen propio de la instalación.
 */
class CatalogoAdminService {
  /** Lista de orígenes con su propiedad y cuántos dashboards dependen de ellos. */
  async listar() {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request().query(
      `SELECT o.OrigenId, o.Clave, o.Nombre, o.Descripcion, o.Tipo, o.Area,
              o.Version, o.Activo, o.Obsoleto, o.Paquete, o.CreadoPor,
              o.OrigenBaseClave, o.FechaActualizacion,
              CASE WHEN o.Paquete IS NULL THEN 1 ELSE 0 END AS EsPropio,
              (SELECT COUNT(*) FROM rep.CatalogoCampo c WHERE c.OrigenId = o.OrigenId) AS Campos,
              u.DashboardsQueLoUsan
       FROM rep.CatalogoOrigen o
       LEFT JOIN rep.vw_UsoOrigen u ON u.OrigenId = o.OrigenId
       ORDER BY o.Paquete, o.Clave`);
    return recordset;
  }

  async obtener(origenId) {
    const pool = await cm.getConfigPool();
    const rs = await pool.request().input('id', sql.Int, origenId).query(`
      SELECT * FROM rep.CatalogoOrigen WHERE OrigenId = @id;
      SELECT * FROM rep.CatalogoCampo WHERE OrigenId = @id ORDER BY Orden, Clave;
      SELECT r.RelacionId, oi.Clave AS OrigenIzq, r.CampoIzq,
             od.Clave AS OrigenDer, r.CampoDer, r.Cardinalidad, r.Activo
      FROM rep.CatalogoRelacion r
      JOIN rep.CatalogoOrigen oi ON oi.OrigenId = r.OrigenIzqId
      JOIN rep.CatalogoOrigen od ON od.OrigenId = r.OrigenDerId
      WHERE r.OrigenIzqId = @id OR r.OrigenDerId = @id;`);
    const o = rs.recordsets[0][0];
    if (!o) return null;
    return { origen: o, campos: rs.recordsets[1], relaciones: rs.recordsets[2],
      esPropio: o.Paquete === null };
  }

  /** Un origen de paquete no se modifica: hay que duplicarlo. */
  async _exigirPropio(origenId) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('id', sql.Int, origenId)
      .query(`SELECT Clave, Paquete FROM rep.CatalogoOrigen WHERE OrigenId = @id`);
    const o = recordset[0];
    if (!o) { const e = new Error('El origen no existe'); e.status = 404; throw e; }
    if (o.Paquete) {
      const e = new Error(
        `"${o.Clave}" pertenece al catálogo ${o.Paquete} y no se puede modificar. ` +
        `Duplíquelo para crear una versión propia.`);
      e.status = 409; throw e;
    }
    return o;
  }

  /** El SQL de un origen pasa la misma guarda que los reportes. */
  async _validarSql(sqlBase) {
    validarSqlReporte(sqlBase, 'El SQL del origen');
  }

  /**
   * Ejecuta el SQL contra la empresa activa y devuelve columnas y muestra.
   * Sirve para previsualizar antes de guardar y para proponer los campos.
   */
  async probar(sqlBase, sessionUser, empresaGestionSesion, area = 'GESTION') {
    await this._validarSql(sqlBase);
    let sel = {};
    if (area === 'GESTION') {
      if (!empresaGestionSesion) {
        const e = new Error('Seleccione una empresa de gestión'); e.status = 400; throw e;
      }
      sel = { codEmpresa: empresaGestionSesion.codEmpresa };
    }
    const emp = await authService.assertEmpresaPermitida(
      sessionUser.codUsuario, area, sel.codEmpresa, sel.ejercicio);
    const pool = await cm.getDataPool({ servidor: emp.servidor, baseDatos: emp.baseDatos });

    // TOP 20 sobre la consulta del administrador, sin tocar su texto.
    const rs = await pool.request().query(`SELECT TOP 20 * FROM (${sqlBase}) AS prueba`);
    const meta = rs.recordset?.columns || {};
    return {
      columnas: Object.keys(meta).map(n => {
        const c = meta[n];
        const tipo = c.type?.declaration ? c.type.declaration.toLowerCase() : '';
        return { nombre: n, tipoSql: tipo, ...this._sugerir(n, tipo, c.scale) };
      }),
      muestra: rs.recordset || []
    };
  }

  /** Propuesta de rol/agregación/formato a partir del tipo SQL. */
  _sugerir(nombre, tipo, escala) {
    const numericos = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric',
      'money', 'smallmoney', 'float', 'real'];
    const esNum = numericos.some(x => tipo.startsWith(x));
    const esFecha = ['date', 'datetime', 'smalldatetime'].some(x => tipo.startsWith(x));
    // Los códigos son numéricos pero describen, no se suman.
    const pareceCodigo = /^(COD|NUM|ID)/i.test(nombre) || /CODIGO$/i.test(nombre);

    if (esFecha) return { rol: 'DIMENSION', agregacion: 'NINGUNA', formato: 'FECHA', tipoDato: 'DATE' };
    if (esNum && !pareceCodigo) {
      return {
        rol: 'METRICA', agregacion: 'SUMA',
        formato: tipo.startsWith('money') ? 'MONEDA' : (escala > 0 ? 'NUMERO' : 'ENTERO'),
        tipoDato: escala > 0 ? 'DECIMAL' : 'INT'
      };
    }
    return {
      rol: 'DIMENSION', agregacion: 'NINGUNA',
      formato: esNum ? 'ENTERO' : 'TEXTO', tipoDato: esNum ? 'INT' : 'STRING'
    };
  }

  /** Crea un origen propio de la instalación. */
  async crear({ clave, nombre, descripcion, tipo, area, sqlBase, campos }, usuario) {
    if (!IDENT.test(clave || '')) {
      const e = new Error('La clave debe ser mayúsculas, números y guion bajo (ej. COMPRASDETALLE)');
      e.status = 400; throw e;
    }
    await this._validarSql(sqlBase);

    const pool = await cm.getConfigPool();
    const { recordset: dup } = await pool.request()
      .input('c', sql.NVarChar(60), clave)
      .query(`SELECT OrigenId FROM rep.CatalogoOrigen WHERE Clave = @c`);
    if (dup.length) {
      const e = new Error(`Ya existe un origen con la clave "${clave}"`); e.status = 409; throw e;
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const ins = await new sql.Request(tx)
        .input('c', sql.NVarChar(60), clave)
        .input('n', sql.NVarChar(120), nombre || clave)
        .input('d', sql.NVarChar(400), descripcion ?? null)
        .input('t', sql.VarChar(10), (tipo || 'HECHOS').toUpperCase())
        .input('a', sql.VarChar(10), (area || 'GESTION').toUpperCase())
        .input('s', sql.NVarChar(sql.MAX), sqlBase)
        .input('u', sql.NVarChar(60), usuario?.usuario ?? null)
        .query(`INSERT INTO rep.CatalogoOrigen
                (Clave, Nombre, Descripcion, Tipo, Area, SqlBase, Paquete, CreadoPor)
                OUTPUT inserted.OrigenId
                VALUES (@c, @n, @d, @t, @a, @s, NULL, @u)`);
      const origenId = ins.recordset[0].OrigenId;
      await this._guardarCampos(tx, origenId, campos || []);
      await tx.commit();
      catalogo.invalidar();
      return origenId;
    } catch (e) { await tx.rollback(); throw e; }
  }

  async actualizar(origenId, { nombre, descripcion, tipo, area, sqlBase, campos }, usuario) {
    await this._exigirPropio(origenId);
    if (sqlBase) await this._validarSql(sqlBase);

    const pool = await cm.getConfigPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('id', sql.Int, origenId)
        .input('n', sql.NVarChar(120), nombre)
        .input('d', sql.NVarChar(400), descripcion ?? null)
        .input('t', sql.VarChar(10), (tipo || 'HECHOS').toUpperCase())
        .input('a', sql.VarChar(10), (area || 'GESTION').toUpperCase())
        .input('s', sql.NVarChar(sql.MAX), sqlBase)
        .query(`UPDATE rep.CatalogoOrigen
                SET Nombre=@n, Descripcion=@d, Tipo=@t, Area=@a,
                    SqlBase = ISNULL(@s, SqlBase), Version = Version + 1,
                    FechaActualizacion = SYSDATETIME()
                WHERE OrigenId=@id`);
      if (campos) await this._guardarCampos(tx, origenId, campos);
      await tx.commit();
      catalogo.invalidar();
    } catch (e) { await tx.rollback(); throw e; }
  }

  /**
   * Guarda los campos. Los que desaparecen NO se borran: se marcan obsoletos,
   * para que un dashboard que los use avise en lugar de romperse.
   */
  async _guardarCampos(tx, origenId, campos) {
    const claves = campos.map(c => c.clave);
    for (const c of campos) {
      if (!IDENT.test(c.clave || '')) {
        throw Object.assign(
          new Error(`Clave de campo inválida: "${c.clave}"`), { status: 400 });
      }
      await new sql.Request(tx)
        .input('o', sql.Int, origenId)
        .input('c', sql.NVarChar(60), c.clave)
        .input('e', sql.NVarChar(120), c.etiqueta || c.clave)
        .input('d', sql.NVarChar(300), c.descripcion ?? null)
        .input('x', sql.NVarChar(400), c.expresion || c.clave)
        .input('r', sql.VarChar(10), c.rol || 'DIMENSION')
        .input('t', sql.VarChar(10), c.tipoDato || 'STRING')
        .input('a', sql.VarChar(20), c.agregacion || 'NINGUNA')
        .input('f', sql.VarChar(12), c.formato || 'TEXTO')
        .input('n', sql.Int, c.orden ?? 0)
        .query(`
          IF EXISTS (SELECT 1 FROM rep.CatalogoCampo WHERE OrigenId=@o AND Clave=@c)
            UPDATE rep.CatalogoCampo
            SET Etiqueta=@e, Descripcion=@d, Expresion=@x, Rol=@r, TipoDato=@t,
                Agregacion=@a, Formato=@f, Orden=@n, Obsoleto=0
            WHERE OrigenId=@o AND Clave=@c;
          ELSE
            INSERT INTO rep.CatalogoCampo
              (OrigenId, Clave, Etiqueta, Descripcion, Expresion, Rol, TipoDato, Agregacion, Formato, Orden)
            VALUES (@o, @c, @e, @d, @x, @r, @t, @a, @f, @n);`);
    }
    // Marcar obsoletos los que ya no vienen en la definición.
    const lista = claves.map(c => `'${String(c).replace(/'/g, "''")}'`).join(',') || `''`;
    await new sql.Request(tx).input('o', sql.Int, origenId)
      .query(`UPDATE rep.CatalogoCampo SET Obsoleto = 1
              WHERE OrigenId = @o AND Clave NOT IN (${lista})`);
  }

  /** Duplica un origen (típicamente uno base) como origen propio y editable. */
  async duplicar(origenId, { clave, nombre }, usuario) {
    const det = await this.obtener(origenId);
    if (!det) { const e = new Error('El origen no existe'); e.status = 404; throw e; }
    const nuevaClave = clave || `${det.origen.Clave}_MIO`;
    return this.crear({
      clave: nuevaClave,
      nombre: nombre || `${det.origen.Nombre} (copia)`,
      descripcion: det.origen.Descripcion,
      tipo: det.origen.Tipo,
      area: det.origen.Area,
      sqlBase: det.origen.SqlBase,
      campos: det.campos.filter(c => !c.Obsoleto).map(c => ({
        clave: c.Clave, etiqueta: c.Etiqueta, descripcion: c.Descripcion,
        expresion: c.Expresion, rol: c.Rol, tipoDato: c.TipoDato,
        agregacion: c.Agregacion, formato: c.Formato, orden: c.Orden
      }))
    }, usuario);
  }

  /** Elimina un origen propio; avisa si hay dashboards que lo usan. */
  async eliminar(origenId, { forzar } = {}) {
    const o = await this._exigirPropio(origenId);
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('id', sql.Int, origenId)
      .query(`SELECT DashboardsQueLoUsan FROM rep.vw_UsoOrigen WHERE OrigenId = @id`);
    const usos = recordset[0]?.DashboardsQueLoUsan ?? 0;
    if (usos > 0 && !forzar) {
      const e = new Error(
        `"${o.Clave}" lo usan ${usos} dashboard(s). Elimínelos o confirme para continuar.`);
      e.status = 409; e.usos = usos; throw e;
    }
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, origenId)
        .query(`DELETE FROM rep.CatalogoRelacion WHERE OrigenIzqId=@id OR OrigenDerId=@id`);
      await new sql.Request(tx).input('id', sql.Int, origenId)
        .query(`DELETE FROM rep.CatalogoCampo WHERE OrigenId=@id`);
      await new sql.Request(tx).input('id', sql.Int, origenId)
        .query(`DELETE FROM rep.CatalogoOrigen WHERE OrigenId=@id`);
      await tx.commit();
      catalogo.invalidar();
    } catch (e) { await tx.rollback(); throw e; }
  }

  /** Alta de relación. Al menos uno de los dos extremos debe ser propio. */
  async crearRelacion({ origenIzq, campoIzq, origenDer, campoDer, cardinalidad }) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('i', sql.NVarChar(60), origenIzq)
      .input('d', sql.NVarChar(60), origenDer)
      .query(`SELECT Clave, OrigenId, Paquete FROM rep.CatalogoOrigen WHERE Clave IN (@i, @d)`);
    const izq = recordset.find(o => o.Clave === origenIzq);
    const der = recordset.find(o => o.Clave === origenDer);
    if (!izq || !der) { const e = new Error('Origen no encontrado'); e.status = 400; throw e; }
    if (izq.Paquete && der.Paquete) {
      const e = new Error(
        'No se pueden añadir relaciones entre dos orígenes del catálogo base. ' +
        'Duplique uno de ellos para relacionarlo.');
      e.status = 409; throw e;
    }
    await pool.request()
      .input('a', sql.Int, izq.OrigenId).input('b', sql.NVarChar(60), campoIzq)
      .input('c', sql.Int, der.OrigenId).input('e', sql.NVarChar(60), campoDer)
      .input('k', sql.VarChar(2), cardinalidad || 'N1')
      .query(`IF NOT EXISTS (SELECT 1 FROM rep.CatalogoRelacion
                             WHERE OrigenIzqId=@a AND CampoIzq=@b AND OrigenDerId=@c AND CampoDer=@e)
              INSERT INTO rep.CatalogoRelacion
                (OrigenIzqId, CampoIzq, OrigenDerId, CampoDer, Cardinalidad)
              VALUES (@a, @b, @c, @e, @k)`);
    catalogo.invalidar();
  }

  async eliminarRelacion(relacionId) {
    const pool = await cm.getConfigPool();
    const { recordset } = await pool.request()
      .input('id', sql.Int, relacionId)
      .query(`SELECT oi.Paquete AS PaqIzq, od.Paquete AS PaqDer
              FROM rep.CatalogoRelacion r
              JOIN rep.CatalogoOrigen oi ON oi.OrigenId = r.OrigenIzqId
              JOIN rep.CatalogoOrigen od ON od.OrigenId = r.OrigenDerId
              WHERE r.RelacionId = @id`);
    const r = recordset[0];
    if (!r) return;
    if (r.PaqIzq && r.PaqDer) {
      const e = new Error('Esa relación pertenece al catálogo base y no se puede eliminar.');
      e.status = 409; throw e;
    }
    await pool.request().input('id', sql.Int, relacionId)
      .query(`DELETE FROM rep.CatalogoRelacion WHERE RelacionId = @id`);
    catalogo.invalidar();
  }
}

module.exports = new CatalogoAdminService();
