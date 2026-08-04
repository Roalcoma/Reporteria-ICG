/* ============================================================================
   ICG_Reporteria_Config — Auditoría, versionado de reportes y estadísticas
   Ejecutar DESPUÉS de 01_schema.sql.  Baseline: SQL Server 2016.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

/* ---------------------------------------------------------------------------
   1) Bitácora de eventos: quién hizo qué y cuándo.
      Cubre login, creación/modificación/borrado de reportes, ejecuciones,
      exportaciones, envíos, cambios de programación y SQL rechazado.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.AuditoriaEvento') IS NULL
CREATE TABLE rep.AuditoriaEvento (
    EventoId      BIGINT IDENTITY(1,1) PRIMARY KEY,
    Tipo          VARCHAR(30) NOT NULL,        -- LOGIN, REPORTE_CREAR, REPORTE_EJECUTAR, ...
    Entidad       VARCHAR(20) NULL,            -- REPORTE, CARPETA, PROGRAMACION, SESION
    EntidadId     INT NULL,
    -- Identidad: se guarda el código ICG además del id de la app, para que el
    -- rastro sobreviva aunque el usuario se elimine de rep.UsuarioApp.
    UsuarioAppId  INT NULL,
    CodUsuarioICG INT NULL,
    LoginICG      NVARCHAR(60) NULL,
    EmpresaCod    INT NULL,
    Ejercicio     INT NULL,
    Descripcion   NVARCHAR(400) NULL,
    DetalleJson   NVARCHAR(MAX) NULL
                  CONSTRAINT CK_Aud_Json CHECK (DetalleJson IS NULL OR ISJSON(DetalleJson) = 1),
    Exitoso       BIT NOT NULL DEFAULT 1,
    DireccionIp   NVARCHAR(45) NULL,
    FechaEvento   DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Fecha' AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
CREATE INDEX IX_Aud_Fecha ON rep.AuditoriaEvento(FechaEvento DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Tipo' AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
CREATE INDEX IX_Aud_Tipo ON rep.AuditoriaEvento(Tipo, FechaEvento DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Entidad' AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
CREATE INDEX IX_Aud_Entidad ON rep.AuditoriaEvento(Entidad, EntidadId, FechaEvento DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Usuario' AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
CREATE INDEX IX_Aud_Usuario ON rep.AuditoriaEvento(CodUsuarioICG, FechaEvento DESC);
GO

/* ---------------------------------------------------------------------------
   2) Versionado: snapshot completo de la definición en cada cambio.
      Permite ver la EVOLUCIÓN del reporte y comparar dos versiones.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.ReporteVersion') IS NULL
CREATE TABLE rep.ReporteVersion (
    ReporteVersionId BIGINT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL,                -- sin FK: la historia sobrevive al borrado
    Version       INT NOT NULL,
    Accion        VARCHAR(12) NOT NULL
                  CONSTRAINT CK_Ver_Accion CHECK (Accion IN ('CREAR','MODIFICAR','ELIMINAR','RESTAURAR','IMPORTAR')),
    -- Definición completa serializada (reporte + consultas + parámetros + columnas)
    DefinicionJson NVARCHAR(MAX) NOT NULL
                  CONSTRAINT CK_Ver_Json CHECK (ISJSON(DefinicionJson) = 1),
    NombreReporte NVARCHAR(150) NULL,
    Comentario    NVARCHAR(400) NULL,
    UsuarioAppId  INT NULL,
    CodUsuarioICG INT NULL,
    LoginICG      NVARCHAR(60) NULL,
    FechaCambio   DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Ver_Reporte' AND object_id = OBJECT_ID('rep.ReporteVersion'))
CREATE INDEX IX_Ver_Reporte ON rep.ReporteVersion(ReporteId, Version DESC);
GO

/* ---------------------------------------------------------------------------
   3) Vistas de estadísticas
   --------------------------------------------------------------------------- */

-- Uso por reporte: ejecuciones, usuarios distintos, tiempos y errores.
IF OBJECT_ID('rep.vw_EstadisticasReporte') IS NOT NULL DROP VIEW rep.vw_EstadisticasReporte;
GO
CREATE VIEW rep.vw_EstadisticasReporte AS
SELECT  r.ReporteId,
        r.Nombre,
        r.Tipo,
        r.Area,
        COUNT(e.EjecucionId)                                    AS Ejecuciones,
        COUNT(DISTINCT e.UsuarioAppId)                          AS UsuariosDistintos,
        AVG(CAST(e.DuracionMs AS BIGINT))                       AS DuracionMediaMs,
        MAX(e.DuracionMs)                                       AS DuracionMaxMs,
        SUM(CASE WHEN e.Estado = 'ERROR' THEN 1 ELSE 0 END)     AS Errores,
        MAX(e.FechaEjecucion)                                   AS UltimaEjecucion
FROM rep.Reporte r
LEFT JOIN rep.EjecucionLog e ON e.ReporteId = r.ReporteId
GROUP BY r.ReporteId, r.Nombre, r.Tipo, r.Area;
GO

-- Actividad por usuario.
IF OBJECT_ID('rep.vw_EstadisticasUsuario') IS NOT NULL DROP VIEW rep.vw_EstadisticasUsuario;
GO
CREATE VIEW rep.vw_EstadisticasUsuario AS
SELECT  ua.UsuarioAppId,
        ua.CodUsuarioICG,
        ua.LoginICG,
        COUNT(e.EjecucionId)                                AS Ejecuciones,
        COUNT(DISTINCT e.ReporteId)                         AS ReportesDistintos,
        AVG(CAST(e.DuracionMs AS BIGINT))                   AS DuracionMediaMs,
        MAX(e.FechaEjecucion)                               AS UltimaActividad
FROM rep.UsuarioApp ua
LEFT JOIN rep.EjecucionLog e ON e.UsuarioAppId = ua.UsuarioAppId
GROUP BY ua.UsuarioAppId, ua.CodUsuarioICG, ua.LoginICG;
GO

-- Actividad diaria (para gráficos de tendencia).
IF OBJECT_ID('rep.vw_ActividadDiaria') IS NOT NULL DROP VIEW rep.vw_ActividadDiaria;
GO
CREATE VIEW rep.vw_ActividadDiaria AS
SELECT  CAST(e.FechaEjecucion AS DATE)                      AS Dia,
        COUNT(*)                                            AS Ejecuciones,
        COUNT(DISTINCT e.UsuarioAppId)                      AS UsuariosActivos,
        SUM(CASE WHEN e.Estado = 'ERROR' THEN 1 ELSE 0 END) AS Errores,
        AVG(CAST(e.DuracionMs AS BIGINT))                   AS DuracionMediaMs
FROM rep.EjecucionLog e
GROUP BY CAST(e.FechaEjecucion AS DATE);
GO

PRINT 'Auditoría, versionado y vistas de estadísticas creados.';
GO
