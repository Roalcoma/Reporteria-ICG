/* ============================================================================
   ICG_Reporteria_Config — Lista blanca de procedimientos almacenados
   Ejecutar DESPUÉS de 02_auditoria.sql.  Baseline: SQL Server 2016.

   Un reporte PUEDE ejecutar un procedimiento almacenado, pero SOLO si está
   registrado aquí. No se permite EXEC libre: el creador de reportes no puede
   invocar cualquier SP, únicamente los que un administrador autorizó.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

IF OBJECT_ID('rep.ProcedimientoPermitido') IS NULL
CREATE TABLE rep.ProcedimientoPermitido (
    ProcedimientoId INT IDENTITY(1,1) PRIMARY KEY,
    Esquema      NVARCHAR(128) NOT NULL DEFAULT 'dbo',
    Nombre       NVARCHAR(128) NOT NULL,
    Descripcion  NVARCHAR(400) NULL,
    -- Ámbito: en qué BD de datos se puede usar (NULL = cualquiera permitida)
    BaseDatos    NVARCHAR(128) NULL,
    Activo       BIT NOT NULL DEFAULT 1,
    -- Rastro de autorización: quién lo habilitó y cuándo.
    AutorizadoPor    INT NULL,
    LoginAutorizador NVARCHAR(60) NULL,
    FechaAutorizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ProcPermitido UNIQUE (Esquema, Nombre, BaseDatos),
    -- Solo identificadores T-SQL simples: evita nombres con espacios o inyección.
    CONSTRAINT CK_Proc_Nombre  CHECK (Nombre  NOT LIKE '%[^A-Za-z0-9_]%'),
    CONSTRAINT CK_Proc_Esquema CHECK (Esquema NOT LIKE '%[^A-Za-z0-9_]%')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProcPermitido_Activo' AND object_id = OBJECT_ID('rep.ProcedimientoPermitido'))
CREATE INDEX IX_ProcPermitido_Activo ON rep.ProcedimientoPermitido(Activo, Nombre);
GO

PRINT 'Lista blanca de procedimientos almacenados creada.';
PRINT 'IMPORTANTE: registre aqui solo SPs de LECTURA revisados por un DBA.';
GO
