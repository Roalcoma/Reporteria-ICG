/* ============================================================================
   ICG_Reporteria_Config — Propiedad del catálogo (base vs. propio del cliente)
   Ejecutar DESPUÉS de 09_catalogo_icg_v2.sql.  Baseline: SQL Server 2016.

   REGLA:
   - Los orígenes que publicamos nosotros llevan Paquete = 'ICG-BASE' y son de
     SOLO LECTURA en la interfaz. Así nuestras actualizaciones pueden corregirlos
     (como la del factor de moneda) sin pisar trabajo de nadie.
   - Los orígenes creados en la instalación llevan Paquete = NULL. Son propios
     del cliente y NINGUNA actualización nuestra los toca.
   - Para variar un origen base se DUPLICA: la copia nace como origen propio.

   IMPORTANTE para futuros paquetes: los scripts de catálogo deben filtrar por
   Paquete = 'ICG-BASE' en el MERGE, para no alcanzar jamás los orígenes propios.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

IF COL_LENGTH('rep.CatalogoOrigen', 'Paquete') IS NULL
    ALTER TABLE rep.CatalogoOrigen ADD Paquete NVARCHAR(60) NULL;
GO
IF COL_LENGTH('rep.CatalogoOrigen', 'CreadoPor') IS NULL
    ALTER TABLE rep.CatalogoOrigen ADD CreadoPor NVARCHAR(60) NULL;
GO
IF COL_LENGTH('rep.CatalogoOrigen', 'OrigenBaseClave') IS NULL
    ALTER TABLE rep.CatalogoOrigen ADD OrigenBaseClave NVARCHAR(60) NULL;
GO

/* Todo lo que existe hasta ahora proviene del paquete base. */
UPDATE rep.CatalogoOrigen SET Paquete = 'ICG-BASE' WHERE Paquete IS NULL;
GO

/* Vista de apoyo: cuántos dashboards usan cada origen.
   La configuración del dashboard guarda claves "ORIGEN.CAMPO", así que basta
   con buscar la clave del origen dentro del JSON. */
IF OBJECT_ID('rep.vw_UsoOrigen') IS NOT NULL DROP VIEW rep.vw_UsoOrigen;
GO
CREATE VIEW rep.vw_UsoOrigen AS
SELECT o.OrigenId, o.Clave,
       (SELECT COUNT(*) FROM rep.Dashboard d
         WHERE d.Activo = 1
           AND d.ConfiguracionJson LIKE '%"' + o.Clave + '.%') AS DashboardsQueLoUsan
FROM rep.CatalogoOrigen o;
GO

PRINT 'Propiedad del catálogo aplicada: los orígenes base quedan protegidos.';
GO
