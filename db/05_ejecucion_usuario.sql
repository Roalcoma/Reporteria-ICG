/* ============================================================================
   ICG_Reporteria_Config — Identidad ICG en el registro de ejecuciones
   Ejecutar DESPUÉS de 04_roles.sql.  Baseline: SQL Server 2016.

   PROBLEMA QUE CORRIGE:
   rep.EjecucionLog solo guardaba UsuarioAppId, que es NULL para cualquier
   usuario sin rol asignado explícitamente (la mayoría: quien no está en
   rep.UsuarioApp entra como 'Lectura') y para los administradores de arranque.
   Resultado: las estadísticas por usuario y el "quién consultó este reporte"
   quedaban vacíos. Se guarda además el código de usuario de ICG, que siempre
   existe, igual que ya hacía rep.AuditoriaEvento.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

IF COL_LENGTH('rep.EjecucionLog', 'CodUsuarioICG') IS NULL
    ALTER TABLE rep.EjecucionLog ADD CodUsuarioICG INT NULL;
GO
IF COL_LENGTH('rep.EjecucionLog', 'LoginICG') IS NULL
    ALTER TABLE rep.EjecucionLog ADD LoginICG NVARCHAR(60) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Ejecucion_Usuario')
    CREATE INDEX IX_Ejecucion_Usuario ON rep.EjecucionLog(CodUsuarioICG, FechaEjecucion DESC);
GO

/* Rellena lo ya registrado a partir de la asignación conocida. */
UPDATE e
SET e.CodUsuarioICG = ua.CodUsuarioICG, e.LoginICG = ua.LoginICG
FROM rep.EjecucionLog e
JOIN rep.UsuarioApp ua ON ua.UsuarioAppId = e.UsuarioAppId
WHERE e.CodUsuarioICG IS NULL;
GO

/* --- Vistas de estadísticas: agrupar por la identidad de ICG --- */

IF OBJECT_ID('rep.vw_EstadisticasReporte') IS NOT NULL DROP VIEW rep.vw_EstadisticasReporte;
GO
CREATE VIEW rep.vw_EstadisticasReporte AS
SELECT  r.ReporteId,
        r.Nombre,
        r.Tipo,
        r.Area,
        COUNT(e.EjecucionId)                                    AS Ejecuciones,
        COUNT(DISTINCT e.CodUsuarioICG)                         AS UsuariosDistintos,
        AVG(CAST(e.DuracionMs AS BIGINT))                       AS DuracionMediaMs,
        MAX(e.DuracionMs)                                       AS DuracionMaxMs,
        SUM(CASE WHEN e.Estado = 'ERROR' THEN 1 ELSE 0 END)     AS Errores,
        MAX(e.FechaEjecucion)                                   AS UltimaEjecucion
FROM rep.Reporte r
LEFT JOIN rep.EjecucionLog e ON e.ReporteId = r.ReporteId
GROUP BY r.ReporteId, r.Nombre, r.Tipo, r.Area;
GO

/* Se construye desde EjecucionLog (no desde UsuarioApp) para incluir a todos
   los que ejecutan, tengan o no rol asignado. */
IF OBJECT_ID('rep.vw_EstadisticasUsuario') IS NOT NULL DROP VIEW rep.vw_EstadisticasUsuario;
GO
CREATE VIEW rep.vw_EstadisticasUsuario AS
SELECT  e.CodUsuarioICG,
        MAX(e.LoginICG)                                     AS LoginICG,
        MAX(ua.UsuarioAppId)                                AS UsuarioAppId,
        COUNT(e.EjecucionId)                                AS Ejecuciones,
        COUNT(DISTINCT e.ReporteId)                         AS ReportesDistintos,
        AVG(CAST(e.DuracionMs AS BIGINT))                   AS DuracionMediaMs,
        SUM(CASE WHEN e.Estado = 'ERROR' THEN 1 ELSE 0 END) AS Errores,
        MAX(e.FechaEjecucion)                               AS UltimaActividad
FROM rep.EjecucionLog e
LEFT JOIN rep.UsuarioApp ua ON ua.CodUsuarioICG = e.CodUsuarioICG
WHERE e.CodUsuarioICG IS NOT NULL
GROUP BY e.CodUsuarioICG;
GO

IF OBJECT_ID('rep.vw_ActividadDiaria') IS NOT NULL DROP VIEW rep.vw_ActividadDiaria;
GO
CREATE VIEW rep.vw_ActividadDiaria AS
SELECT  CAST(e.FechaEjecucion AS DATE)                      AS Dia,
        COUNT(*)                                            AS Ejecuciones,
        COUNT(DISTINCT e.CodUsuarioICG)                     AS UsuariosActivos,
        SUM(CASE WHEN e.Estado = 'ERROR' THEN 1 ELSE 0 END) AS Errores,
        AVG(CAST(e.DuracionMs AS BIGINT))                   AS DuracionMediaMs
FROM rep.EjecucionLog e
GROUP BY CAST(e.FechaEjecucion AS DATE);
GO

PRINT 'rep.EjecucionLog ahora registra la identidad de ICG; vistas actualizadas.';
GO
