/* ============================================================================
   ICG_Reporteria_Config — Perfiles de reporte
   Ejecutar DESPUÉS de 05_ejecucion_usuario.sql.  Baseline: SQL Server 2016.

   Un PERFIL agrupa reportes (p. ej. "Contable", "Gerencia de tienda") y se
   asigna a los usuarios. Al añadir o quitar un reporte del perfil, el cambio
   alcanza de inmediato a todos sus usuarios: no hay que tocarlos uno por uno.

   Los perfiles controlan QUÉ REPORTES VE cada usuario; el rol (rep.AppRol)
   sigue controlando QUÉ PUEDE HACER. Son dimensiones distintas.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

IF OBJECT_ID('rep.Perfil') IS NULL
CREATE TABLE rep.Perfil (
    PerfilId    INT IDENTITY(1,1) PRIMARY KEY,
    Nombre      NVARCHAR(80) NOT NULL UNIQUE,
    Descripcion NVARCHAR(300) NULL,
    Activo      BIT NOT NULL DEFAULT 1,
    CreadoPor   INT NULL,
    LoginCreador NVARCHAR(60) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* Reportes incluidos en cada perfil. */
IF OBJECT_ID('rep.PerfilReporte') IS NULL
CREATE TABLE rep.PerfilReporte (
    PerfilId  INT NOT NULL REFERENCES rep.Perfil(PerfilId) ON DELETE CASCADE,
    ReporteId INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    CONSTRAINT PK_PerfilReporte PRIMARY KEY (PerfilId, ReporteId)
);
GO

/* Perfiles asignados a cada usuario.
   Se referencia por CODUSUARIO de ICG (no por UsuarioAppId) porque un usuario
   puede no estar registrado en rep.UsuarioApp y aun así necesitar perfiles. */
IF OBJECT_ID('rep.UsuarioPerfil') IS NULL
CREATE TABLE rep.UsuarioPerfil (
    CodUsuarioICG INT NOT NULL,
    PerfilId      INT NOT NULL REFERENCES rep.Perfil(PerfilId) ON DELETE CASCADE,
    LoginICG      NVARCHAR(60) NULL,
    AsignadoPor   NVARCHAR(60) NULL,
    FechaAsignacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_UsuarioPerfil PRIMARY KEY (CodUsuarioICG, PerfilId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UsuarioPerfil_Perfil' AND object_id = OBJECT_ID('rep.UsuarioPerfil'))
CREATE INDEX IX_UsuarioPerfil_Perfil ON rep.UsuarioPerfil(PerfilId);
GO

/* Vista de apoyo: qué reportes alcanza cada usuario a través de sus perfiles. */
IF OBJECT_ID('rep.vw_ReportesPorUsuario') IS NOT NULL DROP VIEW rep.vw_ReportesPorUsuario;
GO
CREATE VIEW rep.vw_ReportesPorUsuario AS
SELECT DISTINCT up.CodUsuarioICG, pr.ReporteId
FROM rep.UsuarioPerfil up
JOIN rep.PerfilReporte pr ON pr.PerfilId = up.PerfilId
JOIN rep.Perfil p ON p.PerfilId = up.PerfilId AND p.Activo = 1;
GO

PRINT 'Perfiles de reporte creados.';
PRINT 'REGLA: un usuario SIN perfiles asignados ve todos los reportes;';
PRINT 'en cuanto se le asigna al menos uno, solo ve los de sus perfiles.';
GO
