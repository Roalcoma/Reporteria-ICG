/* ============================================================================
   Catálogo semántico ICG — paquete 'ICG-BASE' versión 3: dimensión de fecha
   Ejecutar DESPUÉS de 10_catalogo_propiedad.sql.  Baseline: SQL Server 2016.

   QUÉ AÑADE
   1. Campos de calendario derivados en los orígenes que tienen fecha (año,
      semestre, cuatrimestre, trimestre, mes, semana...). Van calculados en el
      propio origen, así agrupar por mes no necesita ningún join.
   2. Un origen CALENDARIO conformado, para relacionarlo con cualquier otro
      origen que tenga fecha. Se genera al vuelo desde sys.all_objects: no crea
      ninguna tabla en las bases de ICG.

   NOTA: el MERGE filtra por Paquete = 'ICG-BASE' para no tocar jamás los
   orígenes propios de la instalación.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO
SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   1) Orígenes con los campos de calendario ya calculados
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
         CAST(c.FECHA AS DATE) AS FECHA,
         YEAR(c.FECHA)                                   AS ANIO,
         DATEPART(QUARTER, c.FECHA)                      AS TRIMESTRE,
         CASE WHEN MONTH(c.FECHA) <= 4 THEN 1
              WHEN MONTH(c.FECHA) <= 8 THEN 2 ELSE 3 END AS CUATRIMESTRE,
         CASE WHEN MONTH(c.FECHA) <= 6 THEN 1 ELSE 2 END AS SEMESTRE,
         MONTH(c.FECHA)                                  AS MES,
         CONVERT(CHAR(7), c.FECHA, 126)                  AS ANIO_MES,
         DATEPART(ISO_WEEK, c.FECHA)                     AS SEMANA,
         c.CODCLIENTE, c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET,
         c.CODMONEDA, c.FACTORMONEDA
  FROM dbo.ALBVENTALIN l WITH(NOLOCK)
  JOIN dbo.ALBVENTACAB c WITH(NOLOCK)
    ON c.NUMSERIE = l.NUMSERIE AND c.NUMALBARAN = l.NUMALBARAN AND c.N = l.N
  WHERE ISNULL(l.LINEAOCULTA, ''F'') <> ''T''');

INSERT INTO @origenes VALUES (
 'VENTASCABECERA',
 'SELECT c.NUMSERIE, c.NUMALBARAN, c.N,
         CAST(c.FECHA AS DATE) AS FECHA,
         YEAR(c.FECHA)                                   AS ANIO,
         DATEPART(QUARTER, c.FECHA)                      AS TRIMESTRE,
         CASE WHEN MONTH(c.FECHA) <= 4 THEN 1
              WHEN MONTH(c.FECHA) <= 8 THEN 2 ELSE 3 END AS CUATRIMESTRE,
         CASE WHEN MONTH(c.FECHA) <= 6 THEN 1 ELSE 2 END AS SEMESTRE,
         MONTH(c.FECHA)                                  AS MES,
         CONVERT(CHAR(7), c.FECHA, 126)                  AS ANIO_MES,
         DATEPART(ISO_WEEK, c.FECHA)                     AS SEMANA,
         c.CODCLIENTE, c.CODVENDEDOR, c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET,
         c.CODMONEDA, c.FACTORMONEDA,
         c.TOTALBRUTO     * c.FACTORMONEDA AS TOTALBRUTOC,
         c.TOTALNETO      * c.FACTORMONEDA AS TOTALNETOC,
         c.TOTALIMPUESTOS * c.FACTORMONEDA AS TOTALIMPUESTOSC,
         c.TOTALCOSTE     * c.FACTORMONEDA AS TOTALCOSTEC,
         c.TOTALNETO AS TOTALNETO_DOC
  FROM dbo.ALBVENTACAB c WITH(NOLOCK)');

/* Calendario conformado: 20 años de fechas generadas al vuelo.
   No se usa CTE recursiva a propósito: el motor envuelve el origen en una
   subconsulta y OPTION (MAXRECURSION) no es válido ahí. */
INSERT INTO @origenes VALUES (
 'CALENDARIO',
 'SELECT TOP 7305
         CAST(DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01'') AS DATE) AS FECHA,
         YEAR(DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01''))        AS ANIO,
         DATEPART(QUARTER, DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01'')) AS TRIMESTRE,
         MONTH(DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01''))       AS MES,
         CONVERT(CHAR(7), DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01''), 126) AS ANIO_MES,
         DATEPART(ISO_WEEK, DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01'')) AS SEMANA,
         DATEPART(WEEKDAY, DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, ''2018-01-01'')) AS DIA_SEMANA
  FROM sys.all_objects a WITH(NOLOCK) CROSS JOIN sys.all_objects b WITH(NOLOCK)');

MERGE rep.CatalogoOrigen AS d
USING @origenes AS o ON d.Clave = o.Clave AND d.Paquete = 'ICG-BASE'
WHEN MATCHED THEN UPDATE SET
    d.SqlBase = o.SqlBase, d.Version = d.Version + 1, d.FechaActualizacion = SYSDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Clave, Nombre, Descripcion, Tipo, SqlBase, Paquete)
    VALUES (o.Clave, 'Calendario',
            'Fechas con año, trimestre, mes y semana. Relaciónelo para analizar por periodo.',
            'DIMENSION', o.SqlBase, 'ICG-BASE');
GO

/* ---------------------------------------------------------------------------
   2) Campos de calendario
   --------------------------------------------------------------------------- */
DECLARE @campos TABLE (
    OrigenClave NVARCHAR(60), Clave NVARCHAR(60), Etiqueta NVARCHAR(120),
    Descripcion NVARCHAR(300), Expresion NVARCHAR(400), Rol VARCHAR(10),
    TipoDato VARCHAR(10), Agregacion VARCHAR(20), Formato VARCHAR(12), Orden INT);

-- Los mismos campos para los dos orígenes de ventas.
INSERT INTO @campos
SELECT o.Clave, c.Clave, c.Etiqueta, c.Descripcion, c.Expresion, c.Rol, c.TipoDato,
       c.Agregacion, c.Formato, c.Orden
FROM (VALUES
  ('ANIO',        'Año',          'Año del documento.',            'ANIO',     'DIMENSION','INT',   'NINGUNA','ENTERO',10),
  ('SEMESTRE',    'Semestre',     '1 = enero-junio, 2 = julio-diciembre.', 'SEMESTRE','DIMENSION','INT','NINGUNA','ENTERO',11),
  ('CUATRIMESTRE','Cuatrimestre', '1, 2 o 3.',                     'CUATRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',12),
  ('TRIMESTRE',   'Trimestre',    '1 a 4.',                        'TRIMESTRE','DIMENSION','INT',  'NINGUNA','ENTERO',13),
  ('MES',         'Mes',          'Número de mes, 1 a 12.',        'MES',      'DIMENSION','INT',   'NINGUNA','ENTERO',14),
  ('ANIO_MES',    'Año y mes',    'Formato AAAA-MM: ordena bien en gráficos de evolución.', 'ANIO_MES','DIMENSION','STRING','NINGUNA','TEXTO',15),
  ('SEMANA',      'Semana',       'Semana ISO del año.',           'SEMANA',   'DIMENSION','INT',   'NINGUNA','ENTERO',16)
) AS c(Clave, Etiqueta, Descripcion, Expresion, Rol, TipoDato, Agregacion, Formato, Orden)
CROSS JOIN (VALUES ('VENTASDETALLE'), ('VENTASCABECERA')) AS o(Clave);

-- Campos del origen CALENDARIO.
INSERT INTO @campos VALUES
 ('CALENDARIO','FECHA','Fecha','Fecha del calendario.','FECHA','DIMENSION','DATE','NINGUNA','FECHA',1),
 ('CALENDARIO','ANIO','Año','','ANIO','DIMENSION','INT','NINGUNA','ENTERO',2),
 ('CALENDARIO','TRIMESTRE','Trimestre','','TRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',3),
 ('CALENDARIO','MES','Mes','','MES','DIMENSION','INT','NINGUNA','ENTERO',4),
 ('CALENDARIO','ANIO_MES','Año y mes','','ANIO_MES','DIMENSION','STRING','NINGUNA','TEXTO',5),
 ('CALENDARIO','SEMANA','Semana','Semana ISO.','SEMANA','DIMENSION','INT','NINGUNA','ENTERO',6),
 ('CALENDARIO','DIA_SEMANA','Día de la semana','1 = domingo.','DIA_SEMANA','DIMENSION','INT','NINGUNA','ENTERO',7);

MERGE rep.CatalogoCampo AS d
USING (SELECT o.OrigenId, c.* FROM @campos c
       JOIN rep.CatalogoOrigen o ON o.Clave = c.OrigenClave AND o.Paquete = 'ICG-BASE') AS s
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

/* ---------------------------------------------------------------------------
   3) Relación de las ventas con el calendario
   --------------------------------------------------------------------------- */
DECLARE @rel TABLE (Izq NVARCHAR(60), CampoIzq NVARCHAR(60),
                    Der NVARCHAR(60), CampoDer NVARCHAR(60), Card VARCHAR(2));
INSERT INTO @rel VALUES
 ('VENTASDETALLE','FECHA','CALENDARIO','FECHA','N1'),
 ('VENTASCABECERA','FECHA','CALENDARIO','FECHA','N1');

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

IF NOT EXISTS (SELECT 1 FROM rep.CatalogoVersion WHERE Paquete = 'ICG-BASE' AND Version = 3)
    INSERT INTO rep.CatalogoVersion (Paquete, Version, Descripcion)
    VALUES ('ICG-BASE', 3, 'Dimensión de fecha: año, semestre, trimestre, mes y semana');
GO

DECLARE @c INT = (SELECT COUNT(*) FROM rep.CatalogoCampo);
PRINT CONCAT('Catálogo ICG-BASE v3: ', @c, ' campos. Dimensión de fecha disponible.');
GO
