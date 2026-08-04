/* ============================================================================
   ICG_Reporteria_Config — Permiso de administración y rol Administrador
   Ejecutar DESPUÉS de 03_procedimientos.sql.  Baseline: SQL Server 2016.

   Administrar usuarios y roles es más sensible que crear reportes: se separa en
   su propio permiso para que un Creador no pueda auto-promoverse ni cambiar el
   rol de otros.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

/* 1) Nuevo permiso en los roles de la app */
IF COL_LENGTH('rep.AppRol', 'PuedeAdministrar') IS NULL
    ALTER TABLE rep.AppRol ADD PuedeAdministrar BIT NOT NULL DEFAULT 0;
GO

/* 2) Rol Administrador (superconjunto de permisos) */
IF NOT EXISTS (SELECT 1 FROM rep.AppRol WHERE Nombre = 'Administrador')
    INSERT INTO rep.AppRol (Nombre, PuedeCrear, PuedeEditar, PuedeEjecutar,
                            PuedeProgramar, PuedeAdministrar)
    VALUES ('Administrador', 1, 1, 1, 1, 1);
GO

/* 3) El rol Creador/Editor puede programar envíos, pero NO administrar usuarios */
UPDATE rep.AppRol
SET PuedeProgramar = 1, PuedeAdministrar = 0
WHERE Nombre = 'Creador/Editor';
GO

/* 4) Rastro de cambios de rol: quién cambió el rol de quién y cuándo.
      Sin FK a UsuarioApp para que el historial sobreviva a la baja del usuario. */
IF OBJECT_ID('rep.UsuarioRolHistorial') IS NULL
CREATE TABLE rep.UsuarioRolHistorial (
    HistorialId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    CodUsuarioICG  INT NOT NULL,
    LoginICG       NVARCHAR(60) NULL,
    RolAnterior    NVARCHAR(60) NULL,
    RolNuevo       NVARCHAR(60) NULL,
    Accion         VARCHAR(12) NOT NULL
                   CONSTRAINT CK_URH_Accion CHECK (Accion IN ('ASIGNAR','CAMBIAR','QUITAR','ACTIVAR','DESACTIVAR')),
    EjecutadoPor   INT NULL,
    LoginEjecutor  NVARCHAR(60) NULL,
    FechaCambio    DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_URH_Usuario' AND object_id = OBJECT_ID('rep.UsuarioRolHistorial'))
CREATE INDEX IX_URH_Usuario ON rep.UsuarioRolHistorial(CodUsuarioICG, FechaCambio DESC);
GO

PRINT 'Permiso PuedeAdministrar y rol Administrador creados.';
PRINT 'BOOTSTRAP: defina ADMIN_LOGINS en el .env para el primer administrador.';
GO
