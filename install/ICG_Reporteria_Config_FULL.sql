/* ============================================================================
   ICG_Reporteria_Config  —  Script de instalación COMPLETO
   Motor: SQL Server 2016+.  Todo bajo el esquema [rep].
   ES IDEMPOTENTE: puede ejecutarse en una BD existente sin romper nada.
   Orden de ejecución: 01→12 (ya integrado aquí en el orden correcto).
   ============================================================================ */

/* ============================================================================
   01 — Base de datos, esquema y tablas principales
   ============================================================================ */
IF DB_ID('ICG_Reporteria_Config') IS NULL
    CREATE DATABASE ICG_Reporteria_Config;
GO
USE ICG_Reporteria_Config;
GO
IF SCHEMA_ID('rep') IS NULL EXEC('CREATE SCHEMA rep');
GO

IF OBJECT_ID('rep.AppRol') IS NULL
CREATE TABLE rep.AppRol (
    AppRolId       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre         NVARCHAR(60)  NOT NULL UNIQUE,
    PuedeCrear     BIT NOT NULL DEFAULT 0,
    PuedeEditar    BIT NOT NULL DEFAULT 0,
    PuedeEjecutar  BIT NOT NULL DEFAULT 1,
    PuedeProgramar BIT NOT NULL DEFAULT 0,
    Activo         BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('rep.UsuarioApp') IS NULL
CREATE TABLE rep.UsuarioApp (
    UsuarioAppId  INT IDENTITY(1,1) PRIMARY KEY,
    CodUsuarioICG INT NOT NULL UNIQUE,
    LoginICG      NVARCHAR(60) NULL,
    AppRolId      INT NOT NULL REFERENCES rep.AppRol(AppRolId),
    Activo        BIT NOT NULL DEFAULT 1,
    FechaAlta     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('rep.ServidorCredencial') IS NULL
CREATE TABLE rep.ServidorCredencial (
    ServidorCredencialId INT IDENTITY(1,1) PRIMARY KEY,
    Servidor     NVARCHAR(200) NOT NULL UNIQUE,
    TipoAuth     VARCHAR(10) NOT NULL DEFAULT 'SQL'
                 CONSTRAINT CK_Cred_Auth CHECK (TipoAuth IN ('SQL','WINDOWS')),
    UsuarioSql   NVARCHAR(128) NULL,
    PasswordEnc  VARBINARY(MAX) NULL,
    Activo       BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('rep.Empresa') IS NULL
CREATE TABLE rep.Empresa (
    EmpresaId   INT IDENTITY(1,1) PRIMARY KEY,
    CodigoICG   INT NOT NULL,
    Ejercicio   INT NULL,
    Tipo        VARCHAR(10) NOT NULL
                CONSTRAINT CK_Empresa_Tipo CHECK (Tipo IN ('GESTION','CONTABLE')),
    Nombre      NVARCHAR(200) NULL,
    Activo      BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_Empresa UNIQUE (CodigoICG, Tipo, Ejercicio)
);
GO

IF OBJECT_ID('rep.EmpresaBranding') IS NULL
CREATE TABLE rep.EmpresaBranding (
    BrandingId     INT IDENTITY(1,1) PRIMARY KEY,
    EmpresaId      INT NOT NULL REFERENCES rep.Empresa(EmpresaId),
    LogoImagen     VARBINARY(MAX) NULL,
    LogoMime       NVARCHAR(50) NULL,
    EncabezadoHtml NVARCHAR(MAX) NULL,
    PieHtml        NVARCHAR(MAX) NULL,
    Activo         BIT NOT NULL DEFAULT 1,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EmpresaBranding_Empresa' AND object_id = OBJECT_ID('rep.EmpresaBranding'))
    CREATE INDEX IX_EmpresaBranding_Empresa ON rep.EmpresaBranding(EmpresaId);
GO

IF OBJECT_ID('rep.Carpeta') IS NULL
CREATE TABLE rep.Carpeta (
    CarpetaId      INT IDENTITY(1,1) PRIMARY KEY,
    CarpetaPadreId INT NULL REFERENCES rep.Carpeta(CarpetaId),
    Nombre         NVARCHAR(120) NOT NULL,
    Orden          INT NOT NULL DEFAULT 0,
    Activo         BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('rep.Reporte') IS NULL
CREATE TABLE rep.Reporte (
    ReporteId     INT IDENTITY(1,1) PRIMARY KEY,
    CarpetaId     INT NULL REFERENCES rep.Carpeta(CarpetaId),
    Nombre        NVARCHAR(150) NOT NULL,
    Descripcion   NVARCHAR(500) NULL,
    Tipo          VARCHAR(15) NOT NULL
                  CONSTRAINT CK_Reporte_Tipo CHECK (Tipo IN ('SIMPLE','MASTER_DETAIL','DASHBOARD')),
    Area          VARCHAR(10) NOT NULL
                  CONSTRAINT CK_Reporte_Area CHECK (Area IN ('GESTION','CONTABLE')),
    Activo        BIT NOT NULL DEFAULT 1,
    Version       INT NOT NULL DEFAULT 1,
    CreadoPor     INT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    ModificadoPor INT NULL,
    FechaModificacion DATETIME2 NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reporte_Carpeta' AND object_id = OBJECT_ID('rep.Reporte'))
    CREATE INDEX IX_Reporte_Carpeta ON rep.Reporte(CarpetaId);
GO

IF OBJECT_ID('rep.ReporteConsulta') IS NULL
CREATE TABLE rep.ReporteConsulta (
    ConsultaId    INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    Rol           VARCHAR(10) NOT NULL
                  CONSTRAINT CK_Consulta_Rol CHECK (Rol IN ('FLAT','CABECERA','DETALLE','BASE')),
    SqlText       NVARCHAR(MAX) NOT NULL,
    CampoVinculoCabecera NVARCHAR(128) NULL,
    CampoVinculoDetalle  NVARCHAR(128) NULL,
    Orden         INT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_ReporteConsulta UNIQUE (ReporteId, Rol)
);
GO

IF OBJECT_ID('rep.ReporteParametro') IS NULL
CREATE TABLE rep.ReporteParametro (
    ParametroId   INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    Nombre        NVARCHAR(50) NOT NULL,
    Etiqueta      NVARCHAR(120) NOT NULL,
    TipoDato      VARCHAR(10) NOT NULL
                  CONSTRAINT CK_Param_Tipo CHECK (TipoDato IN ('INT','DECIMAL','STRING','DATE','DATETIME','BOOL')),
    Clase         VARCHAR(15) NOT NULL DEFAULT 'VALOR'
                  CONSTRAINT CK_Param_Clase CHECK (Clase IN ('VALOR','IDENTIFICADOR')),
    ControlUI     VARCHAR(20) NOT NULL
                  CONSTRAINT CK_Param_UI CHECK (ControlUI IN ('TEXTO','LISTA_ESTATICA','LISTA_SQL','FECHA','BOOL')),
    Obligatorio   BIT NOT NULL DEFAULT 0,
    PermiteMultiple BIT NOT NULL DEFAULT 0,
    ValorDefault  NVARCHAR(400) NULL,
    Precision     TINYINT NULL,
    Escala        TINYINT NULL,
    SqlOrigen     NVARCHAR(MAX) NULL,
    CampoValor    NVARCHAR(128) NULL,
    CampoTexto    NVARCHAR(128) NULL,
    Orden         INT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_Param UNIQUE (ReporteId, Nombre)
);
GO

IF OBJECT_ID('rep.ReporteParametroOpcion') IS NULL
CREATE TABLE rep.ReporteParametroOpcion (
    OpcionId    INT IDENTITY(1,1) PRIMARY KEY,
    ParametroId INT NOT NULL REFERENCES rep.ReporteParametro(ParametroId) ON DELETE CASCADE,
    Valor       NVARCHAR(200) NOT NULL,
    Texto       NVARCHAR(200) NOT NULL,
    Orden       INT NOT NULL DEFAULT 0
);
GO

IF OBJECT_ID('rep.ReporteColumna') IS NULL
CREATE TABLE rep.ReporteColumna (
    ColumnaId     INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    ConsultaRol   VARCHAR(10) NOT NULL DEFAULT 'FLAT',
    NombreCampo   NVARCHAR(128) NOT NULL,
    AliasVisible  NVARCHAR(150) NULL,
    Formato       VARCHAR(12) NOT NULL DEFAULT 'TEXTO'
                  CONSTRAINT CK_Col_Formato CHECK (Formato IN ('TEXTO','ENTERO','NUMERO','MONEDA','FECHA','PORCENTAJE')),
    FormatoPatron NVARCHAR(40) NULL,
    VisiblePorDefecto BIT NOT NULL DEFAULT 1,
    EsAdicional   BIT NOT NULL DEFAULT 0,
    EsAgrupable   BIT NOT NULL DEFAULT 0,
    AgregacionPie VARCHAR(10) NOT NULL DEFAULT 'NINGUNA'
                  CONSTRAINT CK_Col_Agg CHECK (AgregacionPie IN ('NINGUNA','SUMA','PROMEDIO','CONTEO','MIN','MAX')),
    Orden         INT NOT NULL DEFAULT 0
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReporteColumna_Reporte' AND object_id = OBJECT_ID('rep.ReporteColumna'))
    CREATE INDEX IX_ReporteColumna_Reporte ON rep.ReporteColumna(ReporteId);
GO

IF OBJECT_ID('rep.UsuarioPreferencia') IS NULL
CREATE TABLE rep.UsuarioPreferencia (
    PreferenciaId    INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioAppId     INT NOT NULL REFERENCES rep.UsuarioApp(UsuarioAppId),
    ReporteId        INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    Nombre           NVARCHAR(120) NOT NULL DEFAULT 'Predeterminada',
    EsPredeterminada BIT NOT NULL DEFAULT 1,
    ConfiguracionJson NVARCHAR(MAX) NOT NULL
                     CONSTRAINT CK_Pref_Json CHECK (ISJSON(ConfiguracionJson) = 1),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_Pref UNIQUE (UsuarioAppId, ReporteId, Nombre)
);
GO

IF OBJECT_ID('rep.DashboardConfig') IS NULL
CREATE TABLE rep.DashboardConfig (
    DashboardConfigId INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId    INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    UsuarioAppId INT NULL REFERENCES rep.UsuarioApp(UsuarioAppId),
    Nombre       NVARCHAR(120) NOT NULL,
    Tipo         VARCHAR(10) NOT NULL
                 CONSTRAINT CK_Dash_Tipo CHECK (Tipo IN ('PIVOT','GRAFICO','TABLA')),
    ConfiguracionJson NVARCHAR(MAX) NOT NULL
                 CONSTRAINT CK_Dash_Json CHECK (ISJSON(ConfiguracionJson) = 1),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('rep.ConfiguracionCorreo') IS NULL
CREATE TABLE rep.ConfiguracionCorreo (
    CorreoConfigId  INT IDENTITY(1,1) PRIMARY KEY,
    Nombre          NVARCHAR(80) NOT NULL,
    Host            NVARCHAR(200) NOT NULL,
    Puerto          INT NOT NULL DEFAULT 587,
    Seguridad       VARCHAR(5) NOT NULL DEFAULT 'TLS'
                    CONSTRAINT CK_Correo_Seg CHECK (Seguridad IN ('NONE','SSL','TLS')),
    Usuario         NVARCHAR(200) NULL,
    PasswordEnc     VARBINARY(MAX) NULL,
    RemitenteNombre NVARCHAR(120) NULL,
    RemitenteEmail  NVARCHAR(200) NOT NULL,
    EsPredeterminada BIT NOT NULL DEFAULT 0,
    Activo          BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('rep.Programacion') IS NULL
CREATE TABLE rep.Programacion (
    ProgramacionId  INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId       INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    Nombre          NVARCHAR(120) NOT NULL,
    CronExpresion   NVARCHAR(60) NOT NULL,
    FormatoExportacion VARCHAR(6) NOT NULL
                    CONSTRAINT CK_Prog_Fmt CHECK (FormatoExportacion IN ('CSV','EXCEL','JSON','XML','HTML','PDF')),
    EmpresaId       INT NULL REFERENCES rep.Empresa(EmpresaId),
    ParametrosJson  NVARCHAR(MAX) NULL
                    CONSTRAINT CK_Prog_Json CHECK (ParametrosJson IS NULL OR ISJSON(ParametrosJson)=1),
    Destinatarios   NVARCHAR(MAX) NOT NULL,
    Asunto          NVARCHAR(200) NULL,
    Cuerpo          NVARCHAR(MAX) NULL,
    CorreoConfigId  INT NULL REFERENCES rep.ConfiguracionCorreo(CorreoConfigId),
    Activo          BIT NOT NULL DEFAULT 1,
    ProximaEjecucion DATETIME2 NULL,
    UltimaEjecucion  DATETIME2 NULL,
    CreadoPor       INT NULL,
    FechaCreacion   DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Programacion_Activa' AND object_id = OBJECT_ID('rep.Programacion'))
    CREATE INDEX IX_Programacion_Activa ON rep.Programacion(Activo, ProximaEjecucion);
GO

IF OBJECT_ID('rep.JobCola') IS NULL
CREATE TABLE rep.JobCola (
    JobId          BIGINT IDENTITY(1,1) PRIMARY KEY,
    ProgramacionId INT NULL REFERENCES rep.Programacion(ProgramacionId),
    Estado         VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                   CONSTRAINT CK_Job_Estado CHECK (Estado IN ('PENDIENTE','PROCESANDO','OK','ERROR')),
    Intentos       INT NOT NULL DEFAULT 0,
    MaxIntentos    INT NOT NULL DEFAULT 3,
    LockWorker     NVARCHAR(80) NULL,
    LockFecha      DATETIME2 NULL,
    ProgramadoPara DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    MensajeError   NVARCHAR(MAX) NULL,
    FechaCreacion  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    FechaFin       DATETIME2 NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_JobCola_Pendiente' AND object_id = OBJECT_ID('rep.JobCola'))
    CREATE INDEX IX_JobCola_Pendiente ON rep.JobCola(Estado, ProgramadoPara);
GO

IF OBJECT_ID('rep.EnvioCorreoHistorial') IS NULL
CREATE TABLE rep.EnvioCorreoHistorial (
    EnvioId        BIGINT IDENTITY(1,1) PRIMARY KEY,
    ReporteId      INT NOT NULL REFERENCES rep.Reporte(ReporteId),
    ProgramacionId INT NULL REFERENCES rep.Programacion(ProgramacionId),
    Origen         VARCHAR(10) NOT NULL
                   CONSTRAINT CK_Envio_Origen CHECK (Origen IN ('MANUAL','PROGRAMADO')),
    UsuarioAppId   INT NULL REFERENCES rep.UsuarioApp(UsuarioAppId),
    EmpresaId      INT NULL REFERENCES rep.Empresa(EmpresaId),
    Destinatarios  NVARCHAR(MAX) NOT NULL,
    Asunto         NVARCHAR(200) NULL,
    FormatoAdjunto VARCHAR(10) NULL,
    ParametrosJson NVARCHAR(MAX) NULL,
    Estado         VARCHAR(6) NOT NULL
                   CONSTRAINT CK_Envio_Estado CHECK (Estado IN ('OK','ERROR')),
    MensajeError   NVARCHAR(MAX) NULL,
    FilasResultado INT NULL,
    FechaEnvio     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Envio_Fecha' AND object_id = OBJECT_ID('rep.EnvioCorreoHistorial'))
    CREATE INDEX IX_Envio_Fecha ON rep.EnvioCorreoHistorial(FechaEnvio DESC);
GO

IF OBJECT_ID('rep.EjecucionLog') IS NULL
CREATE TABLE rep.EjecucionLog (
    EjecucionId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    ReporteId      INT NOT NULL REFERENCES rep.Reporte(ReporteId),
    UsuarioAppId   INT NULL REFERENCES rep.UsuarioApp(UsuarioAppId),
    EmpresaId      INT NULL REFERENCES rep.Empresa(EmpresaId),
    ParametrosJson NVARCHAR(MAX) NULL,
    DuracionMs     INT NULL,
    FilasResultado INT NULL,
    Estado         VARCHAR(6) NOT NULL DEFAULT 'OK',
    MensajeError   NVARCHAR(MAX) NULL,
    FechaEjecucion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Ejecucion_Fecha' AND object_id = OBJECT_ID('rep.EjecucionLog'))
    CREATE INDEX IX_Ejecucion_Fecha ON rep.EjecucionLog(FechaEjecucion DESC);
GO

IF OBJECT_ID('rep.PortabilidadLog') IS NULL
CREATE TABLE rep.PortabilidadLog (
    PortabilidadId BIGINT IDENTITY(1,1) PRIMARY KEY,
    Accion         VARCHAR(8) NOT NULL CHECK (Accion IN ('EXPORT','IMPORT')),
    ReporteId      INT NULL,
    NombreReporte  NVARCHAR(150) NULL,
    UsuarioAppId   INT NULL,
    Detalle        NVARCHAR(MAX) NULL,
    Fecha          DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('rep.ConfiguracionApp') IS NULL
CREATE TABLE rep.ConfiguracionApp (
    Clave       NVARCHAR(80) PRIMARY KEY,
    Valor       NVARCHAR(MAX) NULL,
    Descripcion NVARCHAR(200) NULL
);
GO

IF OBJECT_ID('dbo.sessions') IS NULL
CREATE TABLE dbo.sessions (
    sid     NVARCHAR(255) NOT NULL PRIMARY KEY,
    session NVARCHAR(MAX) NOT NULL,
    expires DATETIME      NOT NULL
);
GO

/* Semilla mínima */
IF NOT EXISTS (SELECT 1 FROM rep.AppRol)
INSERT INTO rep.AppRol (Nombre, PuedeCrear, PuedeEditar, PuedeEjecutar, PuedeProgramar) VALUES
    ('Creador/Editor', 1, 1, 1, 1),
    ('Lectura',        0, 0, 1, 0);
GO

/* ============================================================================
   02 — Auditoría, versionado de reportes y vistas de estadísticas
   ============================================================================ */

IF OBJECT_ID('rep.AuditoriaEvento') IS NULL
CREATE TABLE rep.AuditoriaEvento (
    EventoId      BIGINT IDENTITY(1,1) PRIMARY KEY,
    Tipo          VARCHAR(30) NOT NULL,
    Entidad       VARCHAR(20) NULL,
    EntidadId     INT NULL,
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
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Fecha'    AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
    CREATE INDEX IX_Aud_Fecha    ON rep.AuditoriaEvento(FechaEvento DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Tipo'     AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
    CREATE INDEX IX_Aud_Tipo     ON rep.AuditoriaEvento(Tipo, FechaEvento DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Entidad'  AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
    CREATE INDEX IX_Aud_Entidad  ON rep.AuditoriaEvento(Entidad, EntidadId, FechaEvento DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aud_Usuario'  AND object_id = OBJECT_ID('rep.AuditoriaEvento'))
    CREATE INDEX IX_Aud_Usuario  ON rep.AuditoriaEvento(CodUsuarioICG, FechaEvento DESC);
GO

IF OBJECT_ID('rep.ReporteVersion') IS NULL
CREATE TABLE rep.ReporteVersion (
    ReporteVersionId BIGINT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL,
    Version       INT NOT NULL,
    Accion        VARCHAR(12) NOT NULL
                  CONSTRAINT CK_Ver_Accion CHECK (Accion IN ('CREAR','MODIFICAR','ELIMINAR','RESTAURAR','IMPORTAR')),
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

/* ============================================================================
   03 — Lista blanca de procedimientos almacenados
   ============================================================================ */

IF OBJECT_ID('rep.ProcedimientoPermitido') IS NULL
CREATE TABLE rep.ProcedimientoPermitido (
    ProcedimientoId INT IDENTITY(1,1) PRIMARY KEY,
    Esquema      NVARCHAR(128) NOT NULL DEFAULT 'dbo',
    Nombre       NVARCHAR(128) NOT NULL,
    Descripcion  NVARCHAR(400) NULL,
    BaseDatos    NVARCHAR(128) NULL,
    Activo       BIT NOT NULL DEFAULT 1,
    AutorizadoPor    INT NULL,
    LoginAutorizador NVARCHAR(60) NULL,
    FechaAutorizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ProcPermitido UNIQUE (Esquema, Nombre, BaseDatos),
    CONSTRAINT CK_Proc_Nombre  CHECK (Nombre  NOT LIKE '%[^A-Za-z0-9_]%'),
    CONSTRAINT CK_Proc_Esquema CHECK (Esquema NOT LIKE '%[^A-Za-z0-9_]%')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProcPermitido_Activo' AND object_id = OBJECT_ID('rep.ProcedimientoPermitido'))
    CREATE INDEX IX_ProcPermitido_Activo ON rep.ProcedimientoPermitido(Activo, Nombre);
GO

/* ============================================================================
   04 — Permiso PuedeAdministrar y rol Administrador
   ============================================================================ */

IF COL_LENGTH('rep.AppRol', 'PuedeAdministrar') IS NULL
    ALTER TABLE rep.AppRol ADD PuedeAdministrar BIT NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM rep.AppRol WHERE Nombre = 'Administrador')
    INSERT INTO rep.AppRol (Nombre, PuedeCrear, PuedeEditar, PuedeEjecutar,
                            PuedeProgramar, PuedeAdministrar)
    VALUES ('Administrador', 1, 1, 1, 1, 1);
GO

UPDATE rep.AppRol SET PuedeProgramar = 1, PuedeAdministrar = 0
WHERE Nombre = 'Creador/Editor';
GO

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

/* ============================================================================
   05 — Identidad ICG en EjecucionLog + vistas actualizadas
   ============================================================================ */

IF COL_LENGTH('rep.EjecucionLog', 'CodUsuarioICG') IS NULL
    ALTER TABLE rep.EjecucionLog ADD CodUsuarioICG INT NULL;
GO
IF COL_LENGTH('rep.EjecucionLog', 'LoginICG') IS NULL
    ALTER TABLE rep.EjecucionLog ADD LoginICG NVARCHAR(60) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Ejecucion_Usuario' AND object_id = OBJECT_ID('rep.EjecucionLog'))
    CREATE INDEX IX_Ejecucion_Usuario ON rep.EjecucionLog(CodUsuarioICG, FechaEjecucion DESC);
GO

UPDATE e
SET e.CodUsuarioICG = ua.CodUsuarioICG, e.LoginICG = ua.LoginICG
FROM rep.EjecucionLog e
JOIN rep.UsuarioApp ua ON ua.UsuarioAppId = e.UsuarioAppId
WHERE e.CodUsuarioICG IS NULL;
GO

/* ============================================================================
   06 — Perfiles de reporte
   ============================================================================ */

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

IF OBJECT_ID('rep.PerfilReporte') IS NULL
CREATE TABLE rep.PerfilReporte (
    PerfilId  INT NOT NULL REFERENCES rep.Perfil(PerfilId) ON DELETE CASCADE,
    ReporteId INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    CONSTRAINT PK_PerfilReporte PRIMARY KEY (PerfilId, ReporteId)
);
GO

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

/* ============================================================================
   07 — Catálogo semántico y dashboards autogestionados
   ============================================================================ */

IF COL_LENGTH('rep.AppRol', 'PuedeCrearDashboards') IS NULL
    ALTER TABLE rep.AppRol ADD PuedeCrearDashboards BIT NOT NULL DEFAULT 0;
GO
UPDATE rep.AppRol SET PuedeCrearDashboards = 1
WHERE Nombre IN ('Administrador', 'Creador/Editor');
GO

IF OBJECT_ID('rep.CatalogoOrigen') IS NULL
CREATE TABLE rep.CatalogoOrigen (
    OrigenId    INT IDENTITY(1,1) PRIMARY KEY,
    Clave       NVARCHAR(60) NOT NULL UNIQUE,
    Nombre      NVARCHAR(120) NOT NULL,
    Descripcion NVARCHAR(400) NULL,
    Tipo        VARCHAR(10) NOT NULL
                CONSTRAINT CK_Origen_Tipo CHECK (Tipo IN ('HECHOS','DIMENSION')),
    SqlBase     NVARCHAR(MAX) NOT NULL,
    Area        VARCHAR(10) NOT NULL DEFAULT 'GESTION'
                CONSTRAINT CK_Origen_Area CHECK (Area IN ('GESTION','CONTABLE')),
    Version     INT NOT NULL DEFAULT 1,
    Paquete     NVARCHAR(60) NULL,
    CreadoPor   NVARCHAR(60) NULL,
    OrigenBaseClave NVARCHAR(60) NULL,
    Obsoleto    BIT NOT NULL DEFAULT 0,
    Activo      BIT NOT NULL DEFAULT 1,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('rep.CatalogoCampo') IS NULL
CREATE TABLE rep.CatalogoCampo (
    CampoId     INT IDENTITY(1,1) PRIMARY KEY,
    OrigenId    INT NOT NULL REFERENCES rep.CatalogoOrigen(OrigenId),
    Clave       NVARCHAR(60) NOT NULL,
    Etiqueta    NVARCHAR(120) NOT NULL,
    Descripcion NVARCHAR(300) NULL,
    Expresion   NVARCHAR(400) NOT NULL,
    Rol         VARCHAR(10) NOT NULL
                CONSTRAINT CK_Campo_Rol CHECK (Rol IN ('DIMENSION','METRICA')),
    TipoDato    VARCHAR(10) NOT NULL DEFAULT 'STRING'
                CONSTRAINT CK_Campo_Tipo CHECK (TipoDato IN ('INT','DECIMAL','STRING','DATE','DATETIME','BOOL')),
    Agregacion  VARCHAR(20) NOT NULL DEFAULT 'NINGUNA'
                CONSTRAINT CK_Campo_Agg CHECK (Agregacion IN ('NINGUNA','SUMA','PROMEDIO','CONTEO','CONTEO_DISTINTO','MIN','MAX')),
    Formato     VARCHAR(12) NOT NULL DEFAULT 'TEXTO'
                CONSTRAINT CK_Campo_Fmt CHECK (Formato IN ('TEXTO','ENTERO','NUMERO','MONEDA','FECHA','PORCENTAJE')),
    Orden       INT NOT NULL DEFAULT 0,
    Obsoleto    BIT NOT NULL DEFAULT 0,
    ReemplazadoPor NVARCHAR(60) NULL,
    CONSTRAINT UQ_CatalogoCampo UNIQUE (OrigenId, Clave)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CatalogoCampo_Origen' AND object_id = OBJECT_ID('rep.CatalogoCampo'))
    CREATE INDEX IX_CatalogoCampo_Origen ON rep.CatalogoCampo(OrigenId);
GO

IF OBJECT_ID('rep.CatalogoRelacion') IS NULL
CREATE TABLE rep.CatalogoRelacion (
    RelacionId  INT IDENTITY(1,1) PRIMARY KEY,
    OrigenIzqId INT NOT NULL REFERENCES rep.CatalogoOrigen(OrigenId),
    CampoIzq    NVARCHAR(60) NOT NULL,
    OrigenDerId INT NOT NULL REFERENCES rep.CatalogoOrigen(OrigenId),
    CampoDer    NVARCHAR(60) NOT NULL,
    Cardinalidad VARCHAR(2) NOT NULL DEFAULT 'N1'
                CONSTRAINT CK_Rel_Card CHECK (Cardinalidad IN ('N1','1N','NN')),
    Activo      BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_CatalogoRelacion UNIQUE (OrigenIzqId, CampoIzq, OrigenDerId, CampoDer)
);
GO

IF OBJECT_ID('rep.Dashboard') IS NULL
CREATE TABLE rep.Dashboard (
    DashboardId   INT IDENTITY(1,1) PRIMARY KEY,
    Nombre        NVARCHAR(150) NOT NULL,
    Descripcion   NVARCHAR(500) NULL,
    CodUsuarioICG INT NOT NULL,
    LoginICG      NVARCHAR(60) NULL,
    Area          VARCHAR(10) NOT NULL DEFAULT 'GESTION',
    Visibilidad   VARCHAR(10) NOT NULL DEFAULT 'PRIVADO'
                  CONSTRAINT CK_Dash_Vis CHECK (Visibilidad IN ('PRIVADO','PERFIL','USUARIOS','PUBLICO')),
    ConfiguracionJson NVARCHAR(MAX) NOT NULL
                  CONSTRAINT CK_Dashboard_Json CHECK (ISJSON(ConfiguracionJson) = 1),
    Activo        BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    FechaActualizacion DATETIME2 NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Dashboard_Propietario' AND object_id = OBJECT_ID('rep.Dashboard'))
    CREATE INDEX IX_Dashboard_Propietario ON rep.Dashboard(CodUsuarioICG);
GO

IF OBJECT_ID('rep.DashboardCompartido') IS NULL
CREATE TABLE rep.DashboardCompartido (
    CompartidoId  INT IDENTITY(1,1) PRIMARY KEY,
    DashboardId   INT NOT NULL REFERENCES rep.Dashboard(DashboardId) ON DELETE CASCADE,
    PerfilId      INT NULL REFERENCES rep.Perfil(PerfilId),
    CodUsuarioICG INT NULL,
    LoginICG      NVARCHAR(60) NULL,
    PuedeEditar   BIT NOT NULL DEFAULT 0,
    FechaCompartido DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_Comp_Destino CHECK (
        (PerfilId IS NOT NULL AND CodUsuarioICG IS NULL) OR
        (PerfilId IS NULL AND CodUsuarioICG IS NOT NULL))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DashComp_Dashboard' AND object_id = OBJECT_ID('rep.DashboardCompartido'))
    CREATE INDEX IX_DashComp_Dashboard ON rep.DashboardCompartido(DashboardId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DashComp_Usuario' AND object_id = OBJECT_ID('rep.DashboardCompartido'))
    CREATE INDEX IX_DashComp_Usuario  ON rep.DashboardCompartido(CodUsuarioICG);
GO

IF OBJECT_ID('rep.CatalogoVersion') IS NULL
CREATE TABLE rep.CatalogoVersion (
    CatalogoVersionId INT IDENTITY(1,1) PRIMARY KEY,
    Paquete     NVARCHAR(60) NOT NULL,
    Version     INT NOT NULL,
    Descripcion NVARCHAR(300) NULL,
    FechaAplicacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_CatalogoVersion UNIQUE (Paquete, Version)
);
GO

/* ============================================================================
   08 — Catálogo ICG-BASE v1: orígenes, campos y relaciones base
   ============================================================================ */
SET NOCOUNT ON;
GO

DECLARE @origenes TABLE (
    Clave NVARCHAR(60), Nombre NVARCHAR(120), Descripcion NVARCHAR(400),
    Tipo VARCHAR(10), SqlBase NVARCHAR(MAX));

INSERT INTO @origenes VALUES
 ('VENTASDETALLE','Ventas (detalle)',
  'Una fila por línea vendida, con su fecha, cliente y almacén.',
  'HECHOS',
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
   WHERE ISNULL(l.LINEAOCULTA, ''F'') <> ''T'''),
 ('VENTASCABECERA','Ventas (documento)',
  'Una fila por documento de venta.',
  'HECHOS',
  'SELECT c.NUMSERIE, c.NUMALBARAN, c.N,
          CAST(c.FECHA AS DATE) AS FECHA,
          YEAR(c.FECHA) AS ANIO,
          DATEPART(QUARTER, c.FECHA) AS TRIMESTRE,
          CASE WHEN MONTH(c.FECHA)<=4 THEN 1 WHEN MONTH(c.FECHA)<=8 THEN 2 ELSE 3 END AS CUATRIMESTRE,
          CASE WHEN MONTH(c.FECHA)<=6 THEN 1 ELSE 2 END AS SEMESTRE,
          MONTH(c.FECHA) AS MES,
          CONVERT(CHAR(7), c.FECHA, 126) AS ANIO_MES,
          DATEPART(ISO_WEEK, c.FECHA) AS SEMANA,
          c.CODCLIENTE, c.CODVENDEDOR, c.SERIE, c.CAJA, c.ESDEVOLUCION, c.TIQUET,
          c.CODMONEDA, c.FACTORMONEDA,
          c.TOTALBRUTO     * c.FACTORMONEDA AS TOTALBRUTOC,
          c.TOTALNETO      * c.FACTORMONEDA AS TOTALNETOC,
          c.TOTALIMPUESTOS * c.FACTORMONEDA AS TOTALIMPUESTOSC,
          c.TOTALCOSTE     * c.FACTORMONEDA AS TOTALCOSTEC,
          c.TOTALNETO AS TOTALNETO_DOC
   FROM dbo.ALBVENTACAB c WITH(NOLOCK)'),
 ('STOCKS','Existencias',
  'Stock actual por artículo, talla, color y almacén.','HECHOS',
  'SELECT s.CODARTICULO, s.TALLA, s.COLOR, s.CODALMACEN,
          s.STOCK, s.PEDIDO, s.ASERVIR, s.MINIMO
   FROM dbo.STOCKS s WITH(NOLOCK)'),
 ('ARTICULOS','Artículos',
  'Catálogo de artículos.','DIMENSION',
  'SELECT a.CODARTICULO, a.DESCRIPCION, a.DPTO, a.SECCION, a.FAMILIA, a.MARCA, a.DESCATALOGADO
   FROM dbo.ARTICULOS a WITH(NOLOCK)'),
 ('CLIENTES','Clientes',
  'Datos de cliente.','DIMENSION',
  'SELECT c.CODCLIENTE, c.NOMBRECLIENTE, c.NOMBRECOMERCIAL, c.POBLACION, c.PROVINCIA
   FROM dbo.CLIENTES c WITH(NOLOCK)'),
 ('ALMACENES','Almacenes / tiendas',
  'Almacenes y tiendas.','DIMENSION',
  'SELECT a.CODALMACEN, a.NOMBREALMACEN, a.POBLACION, a.PROVINCIA
   FROM dbo.ALMACEN a WITH(NOLOCK)'),
 ('CALENDARIO','Calendario',
  'Fechas con año, trimestre, mes y semana. Relaciónelo para analizar por periodo.','DIMENSION',
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
USING @origenes AS o ON d.Clave = o.Clave
WHEN MATCHED THEN UPDATE SET
    d.Nombre=o.Nombre, d.Descripcion=o.Descripcion, d.Tipo=o.Tipo,
    d.SqlBase=o.SqlBase, d.Version=d.Version+1, d.Activo=1, d.Obsoleto=0,
    d.Paquete='ICG-BASE', d.FechaActualizacion=SYSDATETIME()
WHEN NOT MATCHED THEN
    INSERT (Clave,Nombre,Descripcion,Tipo,SqlBase,Paquete)
    VALUES (o.Clave,o.Nombre,o.Descripcion,o.Tipo,o.SqlBase,'ICG-BASE');
GO

DECLARE @campos TABLE (
    OrigenClave NVARCHAR(60), Clave NVARCHAR(60), Etiqueta NVARCHAR(120),
    Descripcion NVARCHAR(300), Expresion NVARCHAR(400), Rol VARCHAR(10),
    TipoDato VARCHAR(10), Agregacion VARCHAR(20), Formato VARCHAR(12), Orden INT);

-- VENTASDETALLE
INSERT INTO @campos VALUES
 ('VENTASDETALLE','FECHA','Fecha',NULL,'FECHA','DIMENSION','DATE','NINGUNA','FECHA',1),
 ('VENTASDETALLE','ANIO','Año',NULL,'ANIO','DIMENSION','INT','NINGUNA','ENTERO',10),
 ('VENTASDETALLE','SEMESTRE','Semestre',NULL,'SEMESTRE','DIMENSION','INT','NINGUNA','ENTERO',11),
 ('VENTASDETALLE','CUATRIMESTRE','Cuatrimestre',NULL,'CUATRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',12),
 ('VENTASDETALLE','TRIMESTRE','Trimestre',NULL,'TRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',13),
 ('VENTASDETALLE','MES','Mes',NULL,'MES','DIMENSION','INT','NINGUNA','ENTERO',14),
 ('VENTASDETALLE','ANIO_MES','Año y mes',NULL,'ANIO_MES','DIMENSION','STRING','NINGUNA','TEXTO',15),
 ('VENTASDETALLE','SEMANA','Semana',NULL,'SEMANA','DIMENSION','INT','NINGUNA','ENTERO',16),
 ('VENTASDETALLE','CODARTICULO','Código de artículo',NULL,'CODARTICULO','DIMENSION','INT','NINGUNA','ENTERO',2),
 ('VENTASDETALLE','TALLA','Talla',NULL,'TALLA','DIMENSION','STRING','NINGUNA','TEXTO',3),
 ('VENTASDETALLE','COLOR','Color',NULL,'COLOR','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('VENTASDETALLE','CODALMACEN','Almacén',NULL,'CODALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',5),
 ('VENTASDETALLE','CODCLIENTE','Cliente',NULL,'CODCLIENTE','DIMENSION','INT','NINGUNA','ENTERO',6),
 ('VENTASDETALLE','SERIE','Serie',NULL,'SERIE','DIMENSION','STRING','NINGUNA','TEXTO',7),
 ('VENTASDETALLE','CODMONEDA','Moneda',NULL,'CODMONEDA','DIMENSION','INT','NINGUNA','ENTERO',9),
 ('VENTASDETALLE','UNIDADES','Unidades',NULL,'UNIDADESTOTAL','METRICA','DECIMAL','SUMA','NUMERO',20),
 ('VENTASDETALLE','IMPORTE','Importe','Importe en moneda principal.','IMPORTE','METRICA','DECIMAL','SUMA','MONEDA',21),
 ('VENTASDETALLE','COSTE','Coste','Coste en moneda principal.','COSTEC','METRICA','DECIMAL','SUMA','MONEDA',22),
 ('VENTASDETALLE','PRECIO_MEDIO','Precio medio','Precio medio en moneda principal.','PRECIOC','METRICA','DECIMAL','PROMEDIO','MONEDA',23),
 ('VENTASDETALLE','IMPORTE_DOC','Importe (moneda del documento)','Sin convertir.','IMPORTE_DOC','METRICA','DECIMAL','SUMA','MONEDA',30),
 ('VENTASDETALLE','COSTE_DOC','Coste (moneda del documento)','Sin convertir.','COSTE_DOC','METRICA','DECIMAL','SUMA','MONEDA',31),
 ('VENTASDETALLE','FACTORMONEDA','Factor de cambio',NULL,'FACTORMONEDA','METRICA','DECIMAL','PROMEDIO','NUMERO',32),
 ('VENTASDETALLE','LINEAS','Nº de líneas',NULL,'1','METRICA','INT','CONTEO','ENTERO',24);

-- VENTASCABECERA
INSERT INTO @campos VALUES
 ('VENTASCABECERA','FECHA','Fecha',NULL,'FECHA','DIMENSION','DATE','NINGUNA','FECHA',1),
 ('VENTASCABECERA','ANIO','Año',NULL,'ANIO','DIMENSION','INT','NINGUNA','ENTERO',10),
 ('VENTASCABECERA','SEMESTRE','Semestre',NULL,'SEMESTRE','DIMENSION','INT','NINGUNA','ENTERO',11),
 ('VENTASCABECERA','CUATRIMESTRE','Cuatrimestre',NULL,'CUATRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',12),
 ('VENTASCABECERA','TRIMESTRE','Trimestre',NULL,'TRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',13),
 ('VENTASCABECERA','MES','Mes',NULL,'MES','DIMENSION','INT','NINGUNA','ENTERO',14),
 ('VENTASCABECERA','ANIO_MES','Año y mes',NULL,'ANIO_MES','DIMENSION','STRING','NINGUNA','TEXTO',15),
 ('VENTASCABECERA','SEMANA','Semana',NULL,'SEMANA','DIMENSION','INT','NINGUNA','ENTERO',16),
 ('VENTASCABECERA','CODCLIENTE','Cliente',NULL,'CODCLIENTE','DIMENSION','INT','NINGUNA','ENTERO',2),
 ('VENTASCABECERA','CODVENDEDOR','Vendedor',NULL,'CODVENDEDOR','DIMENSION','INT','NINGUNA','ENTERO',3),
 ('VENTASCABECERA','SERIE','Serie',NULL,'SERIE','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('VENTASCABECERA','CAJA','Caja',NULL,'CAJA','DIMENSION','STRING','NINGUNA','TEXTO',5),
 ('VENTASCABECERA','CODMONEDA','Moneda',NULL,'CODMONEDA','DIMENSION','INT','NINGUNA','ENTERO',9),
 ('VENTASCABECERA','TOTALNETO','Total neto','En moneda principal.','TOTALNETOC','METRICA','DECIMAL','SUMA','MONEDA',20),
 ('VENTASCABECERA','TOTALBRUTO','Total bruto','En moneda principal.','TOTALBRUTOC','METRICA','DECIMAL','SUMA','MONEDA',21),
 ('VENTASCABECERA','TOTALIMPUESTOS','Impuestos','En moneda principal.','TOTALIMPUESTOSC','METRICA','DECIMAL','SUMA','MONEDA',22),
 ('VENTASCABECERA','TOTALCOSTE','Coste','En moneda principal.','TOTALCOSTEC','METRICA','DECIMAL','SUMA','MONEDA',23),
 ('VENTASCABECERA','DOCUMENTOS','Nº de documentos',NULL,'1','METRICA','INT','CONTEO','ENTERO',24),
 ('VENTASCABECERA','TICKET_MEDIO','Ticket medio','En moneda principal.','TOTALNETOC','METRICA','DECIMAL','PROMEDIO','MONEDA',25),
 ('VENTASCABECERA','TOTALNETO_DOC','Total neto (moneda del documento)','Sin convertir.','TOTALNETO_DOC','METRICA','DECIMAL','SUMA','MONEDA',30);

-- STOCKS
INSERT INTO @campos VALUES
 ('STOCKS','CODARTICULO','Código de artículo',NULL,'CODARTICULO','DIMENSION','INT','NINGUNA','ENTERO',1),
 ('STOCKS','TALLA','Talla',NULL,'TALLA','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('STOCKS','COLOR','Color',NULL,'COLOR','DIMENSION','STRING','NINGUNA','TEXTO',3),
 ('STOCKS','CODALMACEN','Almacén',NULL,'CODALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('STOCKS','STOCK','Existencias',NULL,'STOCK','METRICA','DECIMAL','SUMA','NUMERO',20),
 ('STOCKS','PEDIDO','Pedido',NULL,'PEDIDO','METRICA','DECIMAL','SUMA','NUMERO',21),
 ('STOCKS','MINIMO','Stock mínimo',NULL,'MINIMO','METRICA','DECIMAL','SUMA','NUMERO',22);

-- ARTICULOS
INSERT INTO @campos VALUES
 ('ARTICULOS','CODARTICULO','Código',NULL,'CODARTICULO','DIMENSION','INT','NINGUNA','ENTERO',1),
 ('ARTICULOS','DESCRIPCION','Descripción',NULL,'DESCRIPCION','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('ARTICULOS','DPTO','Departamento',NULL,'DPTO','DIMENSION','INT','NINGUNA','ENTERO',3),
 ('ARTICULOS','SECCION','Sección',NULL,'SECCION','DIMENSION','INT','NINGUNA','ENTERO',4),
 ('ARTICULOS','FAMILIA','Familia',NULL,'FAMILIA','DIMENSION','INT','NINGUNA','ENTERO',5),
 ('ARTICULOS','MARCA','Marca',NULL,'MARCA','DIMENSION','INT','NINGUNA','ENTERO',6),
 ('ARTICULOS','ARTICULOS_DISTINTOS','Artículos distintos',NULL,'CODARTICULO','METRICA','INT','CONTEO_DISTINTO','ENTERO',20);

-- CLIENTES
INSERT INTO @campos VALUES
 ('CLIENTES','CODCLIENTE','Código',NULL,'CODCLIENTE','DIMENSION','INT','NINGUNA','ENTERO',1),
 ('CLIENTES','NOMBRECLIENTE','Nombre',NULL,'NOMBRECLIENTE','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('CLIENTES','POBLACION','Población',NULL,'POBLACION','DIMENSION','STRING','NINGUNA','TEXTO',3),
 ('CLIENTES','PROVINCIA','Provincia',NULL,'PROVINCIA','DIMENSION','STRING','NINGUNA','TEXTO',4),
 ('CLIENTES','CLIENTES_DISTINTOS','Clientes distintos',NULL,'CODCLIENTE','METRICA','INT','CONTEO_DISTINTO','ENTERO',20);

-- ALMACENES
INSERT INTO @campos VALUES
 ('ALMACENES','CODALMACEN','Código',NULL,'CODALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',1),
 ('ALMACENES','NOMBREALMACEN','Almacén',NULL,'NOMBREALMACEN','DIMENSION','STRING','NINGUNA','TEXTO',2),
 ('ALMACENES','POBLACION','Población',NULL,'POBLACION','DIMENSION','STRING','NINGUNA','TEXTO',3);

-- CALENDARIO
INSERT INTO @campos VALUES
 ('CALENDARIO','FECHA','Fecha',NULL,'FECHA','DIMENSION','DATE','NINGUNA','FECHA',1),
 ('CALENDARIO','ANIO','Año',NULL,'ANIO','DIMENSION','INT','NINGUNA','ENTERO',2),
 ('CALENDARIO','TRIMESTRE','Trimestre',NULL,'TRIMESTRE','DIMENSION','INT','NINGUNA','ENTERO',3),
 ('CALENDARIO','MES','Mes',NULL,'MES','DIMENSION','INT','NINGUNA','ENTERO',4),
 ('CALENDARIO','ANIO_MES','Año y mes',NULL,'ANIO_MES','DIMENSION','STRING','NINGUNA','TEXTO',5),
 ('CALENDARIO','SEMANA','Semana','Semana ISO.','SEMANA','DIMENSION','INT','NINGUNA','ENTERO',6),
 ('CALENDARIO','DIA_SEMANA','Día de la semana','1 = domingo.','DIA_SEMANA','DIMENSION','INT','NINGUNA','ENTERO',7);

MERGE rep.CatalogoCampo AS d
USING (SELECT o.OrigenId, c.* FROM @campos c
       JOIN rep.CatalogoOrigen o ON o.Clave = c.OrigenClave) AS s
   ON d.OrigenId = s.OrigenId AND d.Clave = s.Clave
WHEN MATCHED THEN UPDATE SET
    d.Etiqueta=s.Etiqueta, d.Descripcion=s.Descripcion, d.Expresion=s.Expresion,
    d.Rol=s.Rol, d.TipoDato=s.TipoDato, d.Agregacion=s.Agregacion,
    d.Formato=s.Formato, d.Orden=s.Orden, d.Obsoleto=0
WHEN NOT MATCHED THEN
    INSERT (OrigenId,Clave,Etiqueta,Descripcion,Expresion,Rol,TipoDato,Agregacion,Formato,Orden)
    VALUES (s.OrigenId,s.Clave,s.Etiqueta,s.Descripcion,s.Expresion,s.Rol,s.TipoDato,s.Agregacion,s.Formato,s.Orden);
GO

DECLARE @rel TABLE (Izq NVARCHAR(60), CampoIzq NVARCHAR(60),
                    Der NVARCHAR(60), CampoDer NVARCHAR(60), Card VARCHAR(2));
INSERT INTO @rel VALUES
 ('VENTASDETALLE','CODARTICULO','ARTICULOS','CODARTICULO','N1'),
 ('VENTASDETALLE','CODCLIENTE','CLIENTES','CODCLIENTE','N1'),
 ('VENTASDETALLE','CODALMACEN','ALMACENES','CODALMACEN','N1'),
 ('VENTASDETALLE','FECHA','CALENDARIO','FECHA','N1'),
 ('VENTASCABECERA','CODCLIENTE','CLIENTES','CODCLIENTE','N1'),
 ('VENTASCABECERA','FECHA','CALENDARIO','FECHA','N1'),
 ('STOCKS','CODARTICULO','ARTICULOS','CODARTICULO','N1'),
 ('STOCKS','CODALMACEN','ALMACENES','CODALMACEN','N1'),
 ('VENTASDETALLE','CODARTICULO','STOCKS','CODARTICULO','NN');

MERGE rep.CatalogoRelacion AS d
USING (SELECT oi.OrigenId AS IzqId, r.CampoIzq, od.OrigenId AS DerId, r.CampoDer, r.Card
       FROM @rel r
       JOIN rep.CatalogoOrigen oi ON oi.Clave = r.Izq
       JOIN rep.CatalogoOrigen od ON od.Clave = r.Der) AS s
   ON d.OrigenIzqId=s.IzqId AND d.CampoIzq=s.CampoIzq
  AND d.OrigenDerId=s.DerId AND d.CampoDer=s.CampoDer
WHEN MATCHED THEN UPDATE SET d.Cardinalidad=s.Card, d.Activo=1
WHEN NOT MATCHED THEN
    INSERT (OrigenIzqId,CampoIzq,OrigenDerId,CampoDer,Cardinalidad)
    VALUES (s.IzqId,s.CampoIzq,s.DerId,s.CampoDer,s.Card);
GO

IF NOT EXISTS (SELECT 1 FROM rep.CatalogoVersion WHERE Paquete='ICG-BASE' AND Version=3)
    INSERT INTO rep.CatalogoVersion (Paquete,Version,Descripcion)
    VALUES ('ICG-BASE',3,'Ventas, stocks, artículos, clientes, almacenes, calendario y moneda');
GO

/* ============================================================================
   12 — Preferencias de impresión PDF
   ============================================================================ */

IF COL_LENGTH('rep.Reporte','OrientacionPdf') IS NULL
    ALTER TABLE rep.Reporte ADD OrientacionPdf VARCHAR(10) NOT NULL
        CONSTRAINT DF_Reporte_Orientacion DEFAULT 'VERTICAL';
GO
IF COL_LENGTH('rep.Reporte','TamanoHoja') IS NULL
    ALTER TABLE rep.Reporte ADD TamanoHoja VARCHAR(10) NOT NULL
        CONSTRAINT DF_Reporte_Hoja DEFAULT 'A4';
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_Reporte_Orientacion')
    ALTER TABLE rep.Reporte ADD CONSTRAINT CK_Reporte_Orientacion
        CHECK (OrientacionPdf IN ('VERTICAL','HORIZONTAL'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_Reporte_Hoja')
    ALTER TABLE rep.Reporte ADD CONSTRAINT CK_Reporte_Hoja
        CHECK (TamanoHoja IN ('A4','A3','LETTER','LEGAL','TABLOID'));
GO

/* ============================================================================
   Vistas de estadísticas (versión final)
   ============================================================================ */
IF OBJECT_ID('rep.vw_EstadisticasReporte') IS NOT NULL DROP VIEW rep.vw_EstadisticasReporte;
GO
CREATE VIEW rep.vw_EstadisticasReporte AS
SELECT r.ReporteId, r.Nombre, r.Tipo, r.Area,
       COUNT(e.EjecucionId)                                AS Ejecuciones,
       COUNT(DISTINCT e.CodUsuarioICG)                     AS UsuariosDistintos,
       AVG(CAST(e.DuracionMs AS BIGINT))                   AS DuracionMediaMs,
       MAX(e.DuracionMs)                                   AS DuracionMaxMs,
       SUM(CASE WHEN e.Estado='ERROR' THEN 1 ELSE 0 END)   AS Errores,
       MAX(e.FechaEjecucion)                               AS UltimaEjecucion
FROM rep.Reporte r
LEFT JOIN rep.EjecucionLog e ON e.ReporteId = r.ReporteId
GROUP BY r.ReporteId, r.Nombre, r.Tipo, r.Area;
GO

IF OBJECT_ID('rep.vw_EstadisticasUsuario') IS NOT NULL DROP VIEW rep.vw_EstadisticasUsuario;
GO
CREATE VIEW rep.vw_EstadisticasUsuario AS
SELECT e.CodUsuarioICG,
       MAX(e.LoginICG)                                     AS LoginICG,
       MAX(ua.UsuarioAppId)                                AS UsuarioAppId,
       COUNT(e.EjecucionId)                                AS Ejecuciones,
       COUNT(DISTINCT e.ReporteId)                         AS ReportesDistintos,
       AVG(CAST(e.DuracionMs AS BIGINT))                   AS DuracionMediaMs,
       SUM(CASE WHEN e.Estado='ERROR' THEN 1 ELSE 0 END)   AS Errores,
       MAX(e.FechaEjecucion)                               AS UltimaActividad
FROM rep.EjecucionLog e
LEFT JOIN rep.UsuarioApp ua ON ua.CodUsuarioICG = e.CodUsuarioICG
WHERE e.CodUsuarioICG IS NOT NULL
GROUP BY e.CodUsuarioICG;
GO

IF OBJECT_ID('rep.vw_ActividadDiaria') IS NOT NULL DROP VIEW rep.vw_ActividadDiaria;
GO
CREATE VIEW rep.vw_ActividadDiaria AS
SELECT CAST(e.FechaEjecucion AS DATE)                     AS Dia,
       COUNT(*)                                           AS Ejecuciones,
       COUNT(DISTINCT e.CodUsuarioICG)                    AS UsuariosActivos,
       SUM(CASE WHEN e.Estado='ERROR' THEN 1 ELSE 0 END)  AS Errores,
       AVG(CAST(e.DuracionMs AS BIGINT))                  AS DuracionMediaMs
FROM rep.EjecucionLog e
GROUP BY CAST(e.FechaEjecucion AS DATE);
GO

IF OBJECT_ID('rep.vw_ReportesPorUsuario') IS NOT NULL DROP VIEW rep.vw_ReportesPorUsuario;
GO
CREATE VIEW rep.vw_ReportesPorUsuario AS
SELECT DISTINCT up.CodUsuarioICG, pr.ReporteId
FROM rep.UsuarioPerfil up
JOIN rep.PerfilReporte pr ON pr.PerfilId = up.PerfilId
JOIN rep.Perfil p ON p.PerfilId = up.PerfilId AND p.Activo = 1;
GO

IF OBJECT_ID('rep.vw_UsoOrigen') IS NOT NULL DROP VIEW rep.vw_UsoOrigen;
GO
CREATE VIEW rep.vw_UsoOrigen AS
SELECT o.OrigenId, o.Clave,
       (SELECT COUNT(*) FROM rep.Dashboard d
         WHERE d.Activo=1
           AND d.ConfiguracionJson LIKE '%"' + o.Clave + '.%') AS DashboardsQueLoUsan
FROM rep.CatalogoOrigen o;
GO

/* ============================================================================
   FIN — Asignación del primer administrador
   ============================================================================
   Para el bootstrap del primer admin:
     1) Definir ADMIN_LOGINS=LOGIN_ICG en el .env   (sin DB, sin tabla)
     2) O insertar directamente:
          INSERT INTO rep.UsuarioApp (CodUsuarioICG, LoginICG, AppRolId)
          SELECT CodUsuario, Login, (SELECT AppRolId FROM rep.AppRol WHERE Nombre='Administrador')
          FROM GENERAL.USUARIOS WHERE Login = 'LOGIN_ICG';
   ============================================================================ */

DECLARE @tablas INT = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'rep');
PRINT CONCAT('ICG_Reporteria_Config instalada correctamente. Tablas en esquema rep: ', @tablas);
GO
