/* ============================================================================
   Catálogo semántico ICG — paquete 'ICG-BASE' versión 1
   Ejecutar DESPUÉS de 07_dashboards.sql.  Baseline: SQL Server 2016.

   Este script es el CONTENIDO del catálogo (los orígenes que publicamos), y
   está separado de la estructura a propósito: las actualizaciones futuras del
   catálogo son otro script como este, con versión superior.

   ES IDEMPOTENTE: puede ejecutarse varias veces sin duplicar nada. Los orígenes
   y campos se identifican por su CLAVE lógica, de modo que actualizar el SQL
   interno o añadir campos NO afecta a los dashboards ya creados.

   Para RETIRAR un campo, no lo borre: márquelo Obsoleto = 1 y, si procede,
   indique ReemplazadoPor. Así los dashboards antiguos avisan en vez de romperse.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO
SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   ORÍGENES
   --------------------------------------------------------------------------- */
DECLARE @origenes TABLE (
    Clave NVARCHAR(60), Nombre NVARCHAR(120), Descripcion NVARCHAR(400),
    Tipo VARCHAR(10), SqlBase NVARCHAR(MAX));

-- Detalle de ventas: una fila por línea de albarán, enriquecida con su cabecera.
INSERT INTO @origenes VALUES (
 'VENTASDETALLE', 'Ventas (detalle)',
 'Una fila por línea vendida, con su fecha, cliente y almacén. Base para analizar qué se vende.',
 'HECHOS',
 'SELECT l.CODARTICULO, l.TALLA, l.COLOR, l.CODALMACEN, l.CODVENDEDOR,
         l.UNIDADESTOTAL, l.TOTAL, l.COSTE, l.PRECIO, l.DTO,
         c.FECHA, c.CODCLIENTE, c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET
  FROM dbo.ALBVENTALIN l WITH(NOLOCK)
  JOIN dbo.ALBVENTACAB c WITH(NOLOCK)
    ON c.NUMSERIE = l.NUMSERIE AND c.NUMALBARAN = l.NUMALBARAN AND c.N = l.N
  WHERE ISNULL(l.LINEAOCULTA, ''F'') <> ''T''');

-- Cabecera de ventas: una fila por documento. Sirve para contar tickets y totales.
INSERT INTO @origenes VALUES (
 'VENTASCABECERA', 'Ventas (documento)',
 'Una fila por documento de venta. Úselo para número de tickets, ticket medio y totales sin duplicar.',
 'HECHOS',
 'SELECT c.NUMSERIE, c.NUMALBARAN, c.N, c.FECHA, c.CODCLIENTE, c.CODVENDEDOR,
         c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET,
         c.TOTALBRUTO, c.TOTALNETO, c.TOTALIMPUESTOS, c.TOTALCOSTE
  FROM dbo.ALBVENTACAB c WITH(NOLOCK)');

-- Existencias actuales por artículo y almacén.
INSERT INTO @origenes VALUES (
 'STOCKS', 'Existencias',
 'Stock actual por artículo, talla, color y almacén.',
 'HECHOS',
 'SELECT s.CODARTICULO, s.TALLA, s.COLOR, s.CODALMACEN,
         s.STOCK, s.PEDIDO, s.ASERVIR, s.MINIMO
  FROM dbo.STOCKS s WITH(NOLOCK)');

INSERT INTO @origenes VALUES (
 'ARTICULOS', 'Artículos',
 'Catálogo de artículos: descripción, departamento, sección, familia y marca.',
 'DIMENSION',
 'SELECT a.CODARTICULO, a.DESCRIPCION, a.DPTO, a.SECCION, a.FAMILIA, a.MARCA, a.DESCATALOGADO
  FROM dbo.ARTICULOS a WITH(NOLOCK)');

INSERT INTO @origenes VALUES (
 'CLIENTES', 'Clientes',
 'Datos de cliente para segmentar las ventas.',
 'DIMENSION',
 'SELECT c.CODCLIENTE, c.NOMBRECLIENTE, c.NOMBRECOMERCIAL, c.POBLACION, c.PROVINCIA
  FROM dbo.CLIENTES c WITH(NOLOCK)');

INSERT INTO @origenes VALUES (
 'ALMACENES', 'Almacenes / tiendas',
 'Almacenes y tiendas, para analizar por punto de venta.',
 'DIMENSION',
 'SELECT a.CODALMACEN, a.NOMBREALMACEN, a.POBLACION, a.PROVINCIA
  FROM dbo.ALMACEN a WITH(NOLOCK)');

MERGE rep.CatalogoOrigen AS d
USING @origenes AS o ON d.Clave = o.Clave
WHEN MATCHED THEN UPDATE SET
    d.Nombre = o.Nombre, d.Descripcion = o.Descripcion, d.Tipo = o.Tipo,
    d.SqlBase = o.SqlBase, d.Version = d.Version + 1, d.Activo = 1, d.Obsoleto = 0,
    d.FechaActualizacion = SYSDATETIME()
WHEN NOT MATCHED THEN
    INSERT (Clave, Nombre, Descripcion, Tipo, SqlBase)
    VALUES (o.Clave, o.Nombre, o.Descripcion, o.Tipo, o.SqlBase);
GO

/* ---------------------------------------------------------------------------
   CAMPOS
   --------------------------------------------------------------------------- */
DECLARE @campos TABLE (
    OrigenClave NVARCHAR(60), Clave NVARCHAR(60), Etiqueta NVARCHAR(120),
    Expresion NVARCHAR(400), Rol VARCHAR(10), TipoDato VARCHAR(10),
    Agregacion VARCHAR(20), Formato VARCHAR(12), Orden INT);

-- VENTASDETALLE
INSERT INTO @campos VALUES
 ('VENTASDETALLE','FECHA','Fecha','FECHA','DIMENSION','DATE','NINGUNA','FECHA',1),
 ('VENTASDETALLE','CODARTICULO','Código de artículo','CODARTICULO','DIMENSION','INT','NINGUNA','ENTERO',2),
 ('VENTASDETALLE','TALLA','Talla','TALLA','DIMENSION','STRING','NINGUNA','TEXTO',3),
 ('VENTASDETALLE','COLOR','Color','COLOR','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('VENTASDETALLE','CODALMACEN','Almacén','CODALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',5),
 ('VENTASDETALLE','CODCLIENTE','Cliente','CODCLIENTE','DIMENSION','INT','NINGUNA','ENTERO',6),
 ('VENTASDETALLE','SERIE','Serie','SERIE','DIMENSION','STRING','NINGUNA','TEXTO',7),
 ('VENTASDETALLE','ESDEVOLUCION','Es devolución','ESDEVOLUCION','DIMENSION','STRING','NINGUNA','TEXTO',8),
 ('VENTASDETALLE','UNIDADES','Unidades','UNIDADESTOTAL','METRICA','DECIMAL','SUMA','NUMERO',20),
 ('VENTASDETALLE','IMPORTE','Importe','TOTAL','METRICA','DECIMAL','SUMA','MONEDA',21),
 ('VENTASDETALLE','COSTE','Coste','COSTE','METRICA','DECIMAL','SUMA','MONEDA',22),
 ('VENTASDETALLE','PRECIO_MEDIO','Precio medio','PRECIO','METRICA','DECIMAL','PROMEDIO','MONEDA',23),
 ('VENTASDETALLE','LINEAS','Nº de líneas','1','METRICA','INT','CONTEO','ENTERO',24);

-- VENTASCABECERA
INSERT INTO @campos VALUES
 ('VENTASCABECERA','FECHA','Fecha','FECHA','DIMENSION','DATE','NINGUNA','FECHA',1),
 ('VENTASCABECERA','CODCLIENTE','Cliente','CODCLIENTE','DIMENSION','INT','NINGUNA','ENTERO',2),
 ('VENTASCABECERA','CODVENDEDOR','Vendedor','CODVENDEDOR','DIMENSION','INT','NINGUNA','ENTERO',3),
 ('VENTASCABECERA','SERIE','Serie','SERIE','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('VENTASCABECERA','CAJA','Caja','CAJA','DIMENSION','STRING','NINGUNA','TEXTO',5),
 ('VENTASCABECERA','TOTALNETO','Total neto','TOTALNETO','METRICA','DECIMAL','SUMA','MONEDA',20),
 ('VENTASCABECERA','TOTALBRUTO','Total bruto','TOTALBRUTO','METRICA','DECIMAL','SUMA','MONEDA',21),
 ('VENTASCABECERA','TOTALIMPUESTOS','Impuestos','TOTALIMPUESTOS','METRICA','DECIMAL','SUMA','MONEDA',22),
 ('VENTASCABECERA','TOTALCOSTE','Coste','TOTALCOSTE','METRICA','DECIMAL','SUMA','MONEDA',23),
 ('VENTASCABECERA','DOCUMENTOS','Nº de documentos','1','METRICA','INT','CONTEO','ENTERO',24),
 ('VENTASCABECERA','TICKET_MEDIO','Ticket medio','TOTALNETO','METRICA','DECIMAL','PROMEDIO','MONEDA',25);

-- STOCKS
INSERT INTO @campos VALUES
 ('STOCKS','CODARTICULO','Código de artículo','CODARTICULO','DIMENSION','INT','NINGUNA','ENTERO',1),
 ('STOCKS','TALLA','Talla','TALLA','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('STOCKS','COLOR','Color','COLOR','DIMENSION','STRING','NINGUNA','TEXTO',3),
 ('STOCKS','CODALMACEN','Almacén','CODALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('STOCKS','STOCK','Existencias','STOCK','METRICA','DECIMAL','SUMA','NUMERO',20),
 ('STOCKS','PEDIDO','Pedido','PEDIDO','METRICA','DECIMAL','SUMA','NUMERO',21),
 ('STOCKS','MINIMO','Stock mínimo','MINIMO','METRICA','DECIMAL','SUMA','NUMERO',22);

-- ARTICULOS (dimensión)
INSERT INTO @campos VALUES
 ('ARTICULOS','CODARTICULO','Código','CODARTICULO','DIMENSION','INT','NINGUNA','ENTERO',1),
 ('ARTICULOS','DESCRIPCION','Descripción','DESCRIPCION','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('ARTICULOS','DPTO','Departamento','DPTO','DIMENSION','INT','NINGUNA','ENTERO',3),
 ('ARTICULOS','SECCION','Sección','SECCION','DIMENSION','INT','NINGUNA','ENTERO',4),
 ('ARTICULOS','FAMILIA','Familia','FAMILIA','DIMENSION','INT','NINGUNA','ENTERO',5),
 ('ARTICULOS','MARCA','Marca','MARCA','DIMENSION','INT','NINGUNA','ENTERO',6),
 ('ARTICULOS','ARTICULOS_DISTINTOS','Artículos distintos','CODARTICULO','METRICA','INT','CONTEO_DISTINTO','ENTERO',20);

-- CLIENTES (dimensión)
INSERT INTO @campos VALUES
 ('CLIENTES','CODCLIENTE','Código','CODCLIENTE','DIMENSION','INT','NINGUNA','ENTERO',1),
 ('CLIENTES','NOMBRECLIENTE','Nombre','NOMBRECLIENTE','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('CLIENTES','POBLACION','Población','POBLACION','DIMENSION','STRING','NINGUNA','TEXTO',3),
 ('CLIENTES','PROVINCIA','Provincia','PROVINCIA','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('CLIENTES','CLIENTES_DISTINTOS','Clientes distintos','CODCLIENTE','METRICA','INT','CONTEO_DISTINTO','ENTERO',20);

-- ALMACENES (dimensión)
INSERT INTO @campos VALUES
 ('ALMACENES','CODALMACEN','Código','CODALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',1),
 ('ALMACENES','NOMBREALMACEN','Almacén','NOMBREALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('ALMACENES','POBLACION','Población','POBLACION','DIMENSION','STRING','NINGUNA','TEXTO',3);

MERGE rep.CatalogoCampo AS d
USING (SELECT o.OrigenId, c.* FROM @campos c
       JOIN rep.CatalogoOrigen o ON o.Clave = c.OrigenClave) AS s
   ON d.OrigenId = s.OrigenId AND d.Clave = s.Clave
WHEN MATCHED THEN UPDATE SET
    d.Etiqueta = s.Etiqueta, d.Expresion = s.Expresion, d.Rol = s.Rol,
    d.TipoDato = s.TipoDato, d.Agregacion = s.Agregacion, d.Formato = s.Formato,
    d.Orden = s.Orden, d.Obsoleto = 0
WHEN NOT MATCHED THEN
    INSERT (OrigenId, Clave, Etiqueta, Expresion, Rol, TipoDato, Agregacion, Formato, Orden)
    VALUES (s.OrigenId, s.Clave, s.Etiqueta, s.Expresion, s.Rol, s.TipoDato, s.Agregacion, s.Formato, s.Orden);
GO

/* ---------------------------------------------------------------------------
   RELACIONES
   N1 = muchos a uno: enriquecer con una dimensión, no multiplica importes.
   NN = el motor pre-agrega cada lado antes de unir, para no inflar totales.
   --------------------------------------------------------------------------- */
DECLARE @rel TABLE (Izq NVARCHAR(60), CampoIzq NVARCHAR(60),
                    Der NVARCHAR(60), CampoDer NVARCHAR(60), Card VARCHAR(2));
INSERT INTO @rel VALUES
 ('VENTASDETALLE','CODARTICULO','ARTICULOS','CODARTICULO','N1'),
 ('VENTASDETALLE','CODCLIENTE','CLIENTES','CODCLIENTE','N1'),
 ('VENTASDETALLE','CODALMACEN','ALMACENES','CODALMACEN','N1'),
 ('VENTASCABECERA','CODCLIENTE','CLIENTES','CODCLIENTE','N1'),
 ('STOCKS','CODARTICULO','ARTICULOS','CODARTICULO','N1'),
 ('STOCKS','CODALMACEN','ALMACENES','CODALMACEN','N1'),
 -- Ventas y existencias comparten artículo y almacén, pero ambas tienen muchas
 -- filas: se marcan NN para que el motor pre-agregue y no duplique importes.
 ('VENTASDETALLE','CODARTICULO','STOCKS','CODARTICULO','NN');

MERGE rep.CatalogoRelacion AS d
USING (SELECT oi.OrigenId AS IzqId, r.CampoIzq, od.OrigenId AS DerId, r.CampoDer, r.Card
       FROM @rel r
       JOIN rep.CatalogoOrigen oi ON oi.Clave = r.Izq
       JOIN rep.CatalogoOrigen od ON od.Clave = r.Der) AS s
   ON d.OrigenIzqId = s.IzqId AND d.CampoIzq = s.CampoIzq
  AND d.OrigenDerId = s.DerId AND d.CampoDer = s.CampoDer
WHEN MATCHED THEN UPDATE SET d.Cardinalidad = s.Card, d.Activo = 1
WHEN NOT MATCHED THEN
    INSERT (OrigenIzqId, CampoIzq, OrigenDerId, CampoDer, Cardinalidad)
    VALUES (s.IzqId, s.CampoIzq, s.DerId, s.CampoDer, s.Card);
GO

/* Registro de la versión aplicada. */
IF NOT EXISTS (SELECT 1 FROM rep.CatalogoVersion WHERE Paquete = 'ICG-BASE' AND Version = 1)
    INSERT INTO rep.CatalogoVersion (Paquete, Version, Descripcion)
    VALUES ('ICG-BASE', 1, 'Ventas, existencias, artículos, clientes y almacenes');
GO

DECLARE @o INT = (SELECT COUNT(*) FROM rep.CatalogoOrigen);
DECLARE @c INT = (SELECT COUNT(*) FROM rep.CatalogoCampo);
DECLARE @r INT = (SELECT COUNT(*) FROM rep.CatalogoRelacion);
PRINT CONCAT('Catálogo ICG-BASE v1: ', @o, ' orígenes, ', @c, ' campos, ', @r, ' relaciones.');
GO
