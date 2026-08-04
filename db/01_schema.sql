/* ============================================================================
   ICG_Reporteria_Config  —  Base de datos de metadatos AISLADA
   Motor: SQL Server (baseline 2016).  Todo bajo el esquema [rep].
   NO se crea NADA en las bases de datos de ICG.
   ============================================================================ */
IF DB_ID('ICG_Reporteria_Config') IS NULL
    CREATE DATABASE ICG_Reporteria_Config;
GO
USE ICG_Reporteria_Config;
GO
IF SCHEMA_ID('rep') IS NULL EXEC('CREATE SCHEMA rep');
GO

/* ---------------------------------------------------------------------------
   1) Seguridad / roles de reportería (permisos PROPIOS de la app)
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.AppRol') IS NULL
CREATE TABLE rep.AppRol (
    AppRolId       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre         NVARCHAR(60)  NOT NULL UNIQUE,   -- 'Creador/Editor', 'Lectura'
    PuedeCrear     BIT NOT NULL DEFAULT 0,
    PuedeEditar    BIT NOT NULL DEFAULT 0,
    PuedeEjecutar  BIT NOT NULL DEFAULT 1,
    PuedeProgramar BIT NOT NULL DEFAULT 0,
    Activo         BIT NOT NULL DEFAULT 1
);
GO

-- Mapea el usuario ICG (validado contra GENERAL.USUARIOS) a un rol de la app.
IF OBJECT_ID('rep.UsuarioApp') IS NULL
CREATE TABLE rep.UsuarioApp (
    UsuarioAppId  INT IDENTITY(1,1) PRIMARY KEY,
    CodUsuarioICG INT NOT NULL UNIQUE,              -- = GENERAL.USUARIOS.CODUSUARIO
    LoginICG      NVARCHAR(60) NULL,                -- = GENERAL.USUARIOS.USUARIO (cache)
    AppRolId      INT NOT NULL REFERENCES rep.AppRol(AppRolId),
    Activo        BIT NOT NULL DEFAULT 1,
    FechaAlta     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------------------------
   2) Enrutamiento: credenciales de LECTURA por servidor + cache de empresas
      El servidor+BD se derivan de GENERAL...PATHBD ('SERVIDOR:BASEDATOS') en
      tiempo real. Aquí solo guardamos el login de SOLO LECTURA por servidor.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.ServidorCredencial') IS NULL
CREATE TABLE rep.ServidorCredencial (
    ServidorCredencialId INT IDENTITY(1,1) PRIMARY KEY,
    Servidor     NVARCHAR(200) NOT NULL UNIQUE,     -- host tal como aparece en PATHBD (ej. 'LOCALHOST')
    TipoAuth     VARCHAR(10) NOT NULL DEFAULT 'SQL'
                 CONSTRAINT CK_Cred_Auth CHECK (TipoAuth IN ('SQL','WINDOWS')),
    UsuarioSql   NVARCHAR(128) NULL,                -- login SQL de SOLO LECTURA (recomendado)
    PasswordEnc  VARBINARY(MAX) NULL,               -- cifrado a nivel app (AES, llave en .env)
    Activo       BIT NOT NULL DEFAULT 1
);
GO

-- Cache/etiqueta de empresas + soporte de branding. CONTABLE lleva Ejercicio.
IF OBJECT_ID('rep.Empresa') IS NULL
CREATE TABLE rep.Empresa (
    EmpresaId   INT IDENTITY(1,1) PRIMARY KEY,
    CodigoICG   INT NOT NULL,                       -- CODEMPRESA (gestión) o CODIGO (contable)
    Ejercicio   INT NULL,                           -- solo CONTABLE (año fiscal)
    Tipo        VARCHAR(10) NOT NULL
                CONSTRAINT CK_Empresa_Tipo CHECK (Tipo IN ('GESTION','CONTABLE')),
    Nombre      NVARCHAR(200) NULL,                 -- cache de TITULO/DESCRIPCION
    Activo      BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_Empresa UNIQUE (CodigoICG, Tipo, Ejercicio)
);
GO

IF OBJECT_ID('rep.EmpresaBranding') IS NULL
CREATE TABLE rep.EmpresaBranding (
    BrandingId     INT IDENTITY(1,1) PRIMARY KEY,
    EmpresaId      INT NOT NULL REFERENCES rep.Empresa(EmpresaId),
    LogoImagen     VARBINARY(MAX) NULL,
    LogoMime       NVARCHAR(50) NULL,               -- 'image/png'
    EncabezadoHtml NVARCHAR(MAX) NULL,
    PieHtml        NVARCHAR(MAX) NULL,
    Activo         BIT NOT NULL DEFAULT 1,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EmpresaBranding_Empresa' AND object_id = OBJECT_ID('rep.EmpresaBranding'))
CREATE INDEX IX_EmpresaBranding_Empresa ON rep.EmpresaBranding(EmpresaId);
GO

/* ---------------------------------------------------------------------------
   3) Carpetas (Grupos / Subgrupos)  — árbol autorreferenciado
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.Carpeta') IS NULL
CREATE TABLE rep.Carpeta (
    CarpetaId      INT IDENTITY(1,1) PRIMARY KEY,
    CarpetaPadreId INT NULL REFERENCES rep.Carpeta(CarpetaId),
    Nombre         NVARCHAR(120) NOT NULL,
    Orden          INT NOT NULL DEFAULT 0,
    Activo         BIT NOT NULL DEFAULT 1
);
GO

/* ---------------------------------------------------------------------------
   4) Reportes + consultas T-SQL
   --------------------------------------------------------------------------- */
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

-- 1 fila (FLAT/BASE) para SIMPLE/DASHBOARD; 2 filas (CABECERA+DETALLE) para MASTER_DETAIL.
IF OBJECT_ID('rep.ReporteConsulta') IS NULL
CREATE TABLE rep.ReporteConsulta (
    ConsultaId    INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    Rol           VARCHAR(10) NOT NULL
                  CONSTRAINT CK_Consulta_Rol CHECK (Rol IN ('FLAT','CABECERA','DETALLE','BASE')),
    SqlText       NVARCHAR(MAX) NOT NULL,
    CampoVinculoCabecera NVARCHAR(128) NULL,        -- ID en cabecera
    CampoVinculoDetalle  NVARCHAR(128) NULL,        -- campo equivalente en detalle
    Orden         INT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_ReporteConsulta UNIQUE (ReporteId, Rol)
);
GO

/* ---------------------------------------------------------------------------
   5) Parámetros {PARAMETRO}
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.ReporteParametro') IS NULL
CREATE TABLE rep.ReporteParametro (
    ParametroId   INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    Nombre        NVARCHAR(50) NOT NULL,            -- token SIN llaves: FECHA_INI -> {FECHA_INI}
    Etiqueta      NVARCHAR(120) NOT NULL,
    TipoDato      VARCHAR(10) NOT NULL
                  CONSTRAINT CK_Param_Tipo CHECK (TipoDato IN ('INT','DECIMAL','STRING','DATE','DATETIME','BOOL')),
    -- VALOR -> se enlaza (@P). IDENTIFICADOR -> whitelist + QUOTENAME (nunca se enlaza como valor).
    Clase         VARCHAR(15) NOT NULL DEFAULT 'VALOR'
                  CONSTRAINT CK_Param_Clase CHECK (Clase IN ('VALOR','IDENTIFICADOR')),
    ControlUI     VARCHAR(20) NOT NULL
                  CONSTRAINT CK_Param_UI CHECK (ControlUI IN ('TEXTO','LISTA_ESTATICA','LISTA_SQL','FECHA','BOOL')),
    Obligatorio   BIT NOT NULL DEFAULT 0,
    PermiteMultiple BIT NOT NULL DEFAULT 0,         -- multiselección -> STRING_SPLIT
    ValorDefault  NVARCHAR(400) NULL,
    Precision     TINYINT NULL,                     -- solo DECIMAL (respeta escala node-mssql)
    Escala        TINYINT NULL,
    SqlOrigen     NVARCHAR(MAX) NULL,               -- solo LISTA_SQL
    CampoValor    NVARCHAR(128) NULL,
    CampoTexto    NVARCHAR(128) NULL,
    Orden         INT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_Param UNIQUE (ReporteId, Nombre)
);
GO

-- Opciones de LISTA_ESTATICA y whitelist de IDENTIFICADOR.
IF OBJECT_ID('rep.ReporteParametroOpcion') IS NULL
CREATE TABLE rep.ReporteParametroOpcion (
    OpcionId    INT IDENTITY(1,1) PRIMARY KEY,
    ParametroId INT NOT NULL REFERENCES rep.ReporteParametro(ParametroId) ON DELETE CASCADE,
    Valor       NVARCHAR(200) NOT NULL,
    Texto       NVARCHAR(200) NOT NULL,
    Orden       INT NOT NULL DEFAULT 0
);
GO

/* ---------------------------------------------------------------------------
   6) Columnas (presentación definida por el creador)
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.ReporteColumna') IS NULL
CREATE TABLE rep.ReporteColumna (
    ColumnaId     INT IDENTITY(1,1) PRIMARY KEY,
    ReporteId     INT NOT NULL REFERENCES rep.Reporte(ReporteId) ON DELETE CASCADE,
    ConsultaRol   VARCHAR(10) NOT NULL DEFAULT 'FLAT',
    NombreCampo   NVARCHAR(128) NOT NULL,           -- nombre real de la columna del resultset
    AliasVisible  NVARCHAR(150) NULL,               -- título de presentación
    Formato       VARCHAR(12) NOT NULL DEFAULT 'TEXTO'
                  CONSTRAINT CK_Col_Formato CHECK (Formato IN ('TEXTO','ENTERO','NUMERO','MONEDA','FECHA','PORCENTAJE')),
    FormatoPatron NVARCHAR(40) NULL,                -- '#,##0.00', 'dd/MM/yyyy'
    VisiblePorDefecto BIT NOT NULL DEFAULT 1,
    EsAdicional   BIT NOT NULL DEFAULT 0,           -- columna extra ocultable desde la UI
    EsAgrupable   BIT NOT NULL DEFAULT 0,
    AgregacionPie VARCHAR(10) NOT NULL DEFAULT 'NINGUNA'
                  CONSTRAINT CK_Col_Agg CHECK (AgregacionPie IN ('NINGUNA','SUMA','PROMEDIO','CONTEO','MIN','MAX')),
    Orden         INT NOT NULL DEFAULT 0
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReporteColumna_Reporte' AND object_id = OBJECT_ID('rep.ReporteColumna'))
CREATE INDEX IX_ReporteColumna_Reporte ON rep.ReporteColumna(ReporteId);
GO

/* ---------------------------------------------------------------------------
   7) Preferencias visuales por usuario (columnas ocultas/mostradas, orden,
      alias override, agrupación, filtros memorizados) + configs de dashboard
   --------------------------------------------------------------------------- */
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
    UsuarioAppId INT NULL REFERENCES rep.UsuarioApp(UsuarioAppId),  -- NULL = plantilla compartida
    Nombre       NVARCHAR(120) NOT NULL,
    Tipo         VARCHAR(10) NOT NULL
                 CONSTRAINT CK_Dash_Tipo CHECK (Tipo IN ('PIVOT','GRAFICO','TABLA')),
    ConfiguracionJson NVARCHAR(MAX) NOT NULL
                 CONSTRAINT CK_Dash_Json CHECK (ISJSON(ConfiguracionJson) = 1),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------------------------
   8) Correo, programaciones, cola de jobs e historial de envíos
   --------------------------------------------------------------------------- */
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
    CronExpresion   NVARCHAR(60) NOT NULL,          -- '0 7 * * 1-5'
    FormatoExportacion VARCHAR(6) NOT NULL
                    CONSTRAINT CK_Prog_Fmt CHECK (FormatoExportacion IN ('CSV','EXCEL','JSON','XML','HTML')),
    EmpresaId       INT NULL REFERENCES rep.Empresa(EmpresaId),   -- empresa+ejercicio contable fijos
    ParametrosJson  NVARCHAR(MAX) NULL
                    CONSTRAINT CK_Prog_Json CHECK (ParametrosJson IS NULL OR ISJSON(ParametrosJson)=1),
    Destinatarios   NVARCHAR(MAX) NOT NULL,         -- separados por ;
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

-- Cola de jobs para el scheduler (soporta N workers con UPDLOCK, READPAST).
IF OBJECT_ID('rep.JobCola') IS NULL
CREATE TABLE rep.JobCola (
    JobId          BIGINT IDENTITY(1,1) PRIMARY KEY,
    ProgramacionId INT NULL REFERENCES rep.Programacion(ProgramacionId),
    Estado         VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                   CONSTRAINT CK_Job_Estado CHECK (Estado IN ('PENDIENTE','PROCESANDO','OK','ERROR')),
    Intentos       INT NOT NULL DEFAULT 0,
    MaxIntentos    INT NOT NULL DEFAULT 3,
    LockWorker     NVARCHAR(80) NULL,               -- id del worker que lo tomó
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

-- Historial de envíos (manual ad-hoc + programado).
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
    FormatoAdjunto VARCHAR(6) NULL,
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

/* ---------------------------------------------------------------------------
   9) Auditoría de ejecución + portabilidad + config general
   --------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   Semilla mínima
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM rep.AppRol)
INSERT INTO rep.AppRol (Nombre, PuedeCrear, PuedeEditar, PuedeEjecutar, PuedeProgramar) VALUES
    ('Creador/Editor', 1, 1, 1, 1),
    ('Lectura',        0, 0, 1, 0);
GO
PRINT 'ICG_Reporteria_Config: esquema creado correctamente.';
GO
