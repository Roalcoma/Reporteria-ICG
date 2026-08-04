/* ============================================================================
   Catálogo semántico ICG — paquete 'ICG-BASE' versión 2
   Ejecutar DESPUÉS de 08_catalogo_icg.sql.  Baseline: SQL Server 2016.

   QUÉ CORRIGE — CONVERSIÓN DE MONEDA
   En ICG los importes de un documento están expresados en la MONEDA DEL
   DOCUMENTO. Para obtener el importe en la moneda principal hay que
   multiplicarlo por FACTORMONEDA de la cabecera. La versión 1 del catálogo no
   lo hacía, de modo que sumaba importes de monedas distintas.

   Impacto medido sobre datos reales (3 monedas en uso):
       sin factor  19.528.847,59   <- cifra sin sentido, mezcla monedas
       con factor  13.036.181,30   <- importe real en moneda principal

   Los importes convertidos conservan su CLAVE LÓGICA (VENTASDETALLE.IMPORTE),
   así que los dashboards ya creados pasan a mostrar la cifra correcta sin
   ningún cambio. Quien necesite el valor tal cual está en el documento tiene
   ahora campos aparte: IMPORTE_DOC, COSTE_DOC...
   ============================================================================ */
USE ICG_Reporteria_Config;
GO
SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   ORÍGENES: se recalculan los importes en el propio SqlBase.
   Se exponen ya multiplicados para que la expresión del campo sea simple.
   --------------------------------------------------------------------------- */
DECLARE @origenes TABLE (Clave NVARCHAR(60), SqlBase NVARCHAR(MAX));

INSERT INTO @origenes VALUES (
 'VENTASDETALLE',
 'SELECT l.CODARTICULO, l.TALLA, l.COLOR, l.CODALMACEN, l.CODVENDEDOR,
         l.UNIDADESTOTAL,
         l.TOTAL * c.FACTORMONEDA  AS IMPORTE,
         l.COSTE * c.FACTORMONEDA  AS COSTEC,
         l.PRECIO * c.FACTORMONEDA AS PRECIOC,
         l.TOTAL AS IMPORTE_DOC,
         l.COSTE AS COSTE_DOC,
         l.DTO,
         c.FECHA, c.CODCLIENTE, c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET,
         c.CODMONEDA, c.FACTORMONEDA
  FROM dbo.ALBVENTALIN l WITH(NOLOCK)
  JOIN dbo.ALBVENTACAB c WITH(NOLOCK)
    ON c.NUMSERIE = l.NUMSERIE AND c.NUMALBARAN = l.NUMALBARAN AND c.N = l.N
  WHERE ISNULL(l.LINEAOCULTA, ''F'') <> ''T''');

INSERT INTO @origenes VALUES (
 'VENTASCABECERA',
 'SELECT c.NUMSERIE, c.NUMALBARAN, c.N, c.FECHA, c.CODCLIENTE, c.CODVENDEDOR,
         c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET,
         c.CODMONEDA, c.FACTORMONEDA,
         c.TOTALBRUTO     * c.FACTORMONEDA AS TOTALBRUTOC,
         c.TOTALNETO      * c.FACTORMONEDA AS TOTALNETOC,
         c.TOTALIMPUESTOS * c.FACTORMONEDA AS TOTALIMPUESTOSC,
         c.TOTALCOSTE     * c.FACTORMONEDA AS TOTALCOSTEC,
         c.TOTALNETO AS TOTALNETO_DOC
  FROM dbo.ALBVENTACAB c WITH(NOLOCK)');

MERGE rep.CatalogoOrigen AS d
USING @origenes AS o ON d.Clave = o.Clave
WHEN MATCHED THEN UPDATE SET
    d.SqlBase = o.SqlBase, d.Version = d.Version + 1,
    d.FechaActualizacion = SYSDATETIME();
GO

/* ---------------------------------------------------------------------------
   CAMPOS: se reapuntan las métricas de importe a las columnas ya convertidas
   y se añaden las variantes en moneda del documento.
   --------------------------------------------------------------------------- */
DECLARE @campos TABLE (
    OrigenClave NVARCHAR(60), Clave NVARCHAR(60), Etiqueta NVARCHAR(120),
    Descripcion NVARCHAR(300), Expresion NVARCHAR(400), Rol VARCHAR(10),
    TipoDato VARCHAR(10), Agregacion VARCHAR(20), Formato VARCHAR(12), Orden INT);

INSERT INTO @campos VALUES
 -- VENTASDETALLE: importes en moneda principal (los de uso habitual)
 ('VENTASDETALLE','IMPORTE','Importe',
  'Importe convertido a la moneda principal (aplica el factor del documento).',
  'IMPORTE','METRICA','DECIMAL','SUMA','MONEDA',21),
 ('VENTASDETALLE','COSTE','Coste',
  'Coste convertido a la moneda principal.',
  'COSTEC','METRICA','DECIMAL','SUMA','MONEDA',22),
 ('VENTASDETALLE','PRECIO_MEDIO','Precio medio',
  'Precio medio convertido a la moneda principal.',
  'PRECIOC','METRICA','DECIMAL','PROMEDIO','MONEDA',23),
 -- ...y los mismos valores tal como constan en el documento
 ('VENTASDETALLE','IMPORTE_DOC','Importe (moneda del documento)',
  'Importe sin convertir: cuidado al sumarlo si hay varias monedas.',
  'IMPORTE_DOC','METRICA','DECIMAL','SUMA','MONEDA',30),
 ('VENTASDETALLE','COSTE_DOC','Coste (moneda del documento)',
  'Coste sin convertir.',
  'COSTE_DOC','METRICA','DECIMAL','SUMA','MONEDA',31),
 ('VENTASDETALLE','CODMONEDA','Moneda',
  'Moneda del documento. Útil para desglosar o filtrar.',
  'CODMONEDA','DIMENSION','INT','NINGUNA','ENTERO',9),
 ('VENTASDETALLE','FACTORMONEDA','Factor de cambio',
  'Factor aplicado para convertir a la moneda principal.',
  'FACTORMONEDA','METRICA','DECIMAL','PROMEDIO','NUMERO',32),

 -- VENTASCABECERA
 ('VENTASCABECERA','TOTALNETO','Total neto',
  'Total neto convertido a la moneda principal.',
  'TOTALNETOC','METRICA','DECIMAL','SUMA','MONEDA',20),
 ('VENTASCABECERA','TOTALBRUTO','Total bruto',
  'Total bruto convertido a la moneda principal.',
  'TOTALBRUTOC','METRICA','DECIMAL','SUMA','MONEDA',21),
 ('VENTASCABECERA','TOTALIMPUESTOS','Impuestos',
  'Impuestos convertidos a la moneda principal.',
  'TOTALIMPUESTOSC','METRICA','DECIMAL','SUMA','MONEDA',22),
 ('VENTASCABECERA','TOTALCOSTE','Coste',
  'Coste convertido a la moneda principal.',
  'TOTALCOSTEC','METRICA','DECIMAL','SUMA','MONEDA',23),
 ('VENTASCABECERA','TICKET_MEDIO','Ticket medio',
  'Media del total neto por documento, en moneda principal.',
  'TOTALNETOC','METRICA','DECIMAL','PROMEDIO','MONEDA',25),
 ('VENTASCABECERA','TOTALNETO_DOC','Total neto (moneda del documento)',
  'Total neto sin convertir.',
  'TOTALNETO_DOC','METRICA','DECIMAL','SUMA','MONEDA',30),
 ('VENTASCABECERA','CODMONEDA','Moneda',
  'Moneda del documento.',
  'CODMONEDA','DIMENSION','INT','NINGUNA','ENTERO',9);

MERGE rep.CatalogoCampo AS d
USING (SELECT o.OrigenId, c.* FROM @campos c
       JOIN rep.CatalogoOrigen o ON o.Clave = c.OrigenClave) AS s
   ON d.OrigenId = s.OrigenId AND d.Clave = s.Clave
WHEN MATCHED THEN UPDATE SET
    d.Etiqueta = s.Etiqueta, d.Descripcion = s.Descripcion, d.Expresion = s.Expresion,
    d.Rol = s.Rol, d.TipoDato = s.TipoDato, d.Agregacion = s.Agregacion,
    d.Formato = s.Formato, d.Orden = s.Orden, d.Obsoleto = 0
WHEN NOT MATCHED THEN
    INSERT (OrigenId, Clave, Etiqueta, Descripcion, Expresion, Rol, TipoDato, Agregacion, Formato, Orden)
    VALUES (s.OrigenId, s.Clave, s.Etiqueta, s.Descripcion, s.Expresion, s.Rol, s.TipoDato,
            s.Agregacion, s.Formato, s.Orden);
GO

IF NOT EXISTS (SELECT 1 FROM rep.CatalogoVersion WHERE Paquete = 'ICG-BASE' AND Version = 2)
    INSERT INTO rep.CatalogoVersion (Paquete, Version, Descripcion)
    VALUES ('ICG-BASE', 2, 'Importes convertidos a moneda principal con FACTORMONEDA');
GO

DECLARE @c INT = (SELECT COUNT(*) FROM rep.CatalogoCampo);
PRINT CONCAT('Catálogo ICG-BASE v2 aplicado: ', @c, ' campos. Importes en moneda principal.');
GO
