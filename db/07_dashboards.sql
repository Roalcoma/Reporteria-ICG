/* ============================================================================
   ICG_Reporteria_Config — Catálogo semántico y dashboards autogestionados
   Ejecutar DESPUÉS de 06_perfiles.sql.  Baseline: SQL Server 2016.

   IDEA: los usuarios de negocio arman sus propios dashboards SIN escribir SQL.
   Eligen campos de ORÍGENES que nosotros publicamos (VENTASDETALLE, STOCKS,
   ARTICULOS...), y el motor genera la consulta usando las relaciones declaradas.

   COMPATIBILIDAD HACIA ADELANTE — la razón de que el catálogo viva en tablas:
   los dashboards guardan referencias LÓGICAS y estables ("VENTASDETALLE.IMPORTE"),
   nunca SQL ni nombres de columnas de ICG. Así podemos reescribir el SQL interno
   de un origen, corregir un join o añadir campos, y los dashboards ya creados
   siguen funcionando. Un campo que se retire se marca Obsoleto (y opcionalmente
   apunta a su sustituto); nunca se borra, para no romper lo existente.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

/* ---------------------------------------------------------------------------
   1) Permiso propio de autogestión de dashboards
      Separado de PuedeCrear: un usuario de negocio debe poder armar dashboards
      sin recibir acceso al editor de T-SQL.
   --------------------------------------------------------------------------- */
IF COL_LENGTH('rep.AppRol', 'PuedeCrearDashboards') IS NULL
    ALTER TABLE rep.AppRol ADD PuedeCrearDashboards BIT NOT NULL DEFAULT 0;
GO
UPDATE rep.AppRol SET PuedeCrearDashboards = 1
WHERE Nombre IN ('Administrador', 'Creador/Editor');
GO

/* ---------------------------------------------------------------------------
   2) Orígenes de datos publicados
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.CatalogoOrigen') IS NULL
CREATE TABLE rep.CatalogoOrigen (
    OrigenId    INT IDENTITY(1,1) PRIMARY KEY,
    -- Clave lógica estable: es lo que referencian los dashboards.
    Clave       NVARCHAR(60) NOT NULL UNIQUE,
    Nombre      NVARCHAR(120) NOT NULL,
    Descripcion NVARCHAR(400) NULL,
    -- HECHOS: se puede agregar (ventas, stock). DIMENSION: describe (artículos).
    Tipo        VARCHAR(10) NOT NULL
                CONSTRAINT CK_Origen_Tipo CHECK (Tipo IN ('HECHOS','DIMENSION')),
    -- SELECT que define el origen. Lo escribimos nosotros, nunca el usuario.
    SqlBase     NVARCHAR(MAX) NOT NULL,
    -- Área de ICG sobre la que consulta.
    Area        VARCHAR(10) NOT NULL DEFAULT 'GESTION'
                CONSTRAINT CK_Origen_Area CHECK (Area IN ('GESTION','CONTABLE')),
    Version     INT NOT NULL DEFAULT 1,
    Obsoleto    BIT NOT NULL DEFAULT 0,
    Activo      BIT NOT NULL DEFAULT 1,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------------------------
   3) Campos expuestos por cada origen
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.CatalogoCampo') IS NULL
CREATE TABLE rep.CatalogoCampo (
    CampoId     INT IDENTITY(1,1) PRIMARY KEY,
    OrigenId    INT NOT NULL REFERENCES rep.CatalogoOrigen(OrigenId),
    -- Clave lógica dentro del origen (VENTASDETALLE.IMPORTE).
    Clave       NVARCHAR(60) NOT NULL,
    Etiqueta    NVARCHAR(120) NOT NULL,
    Descripcion NVARCHAR(300) NULL,
    -- Expresión SQL sobre las columnas del SqlBase (normalmente el nombre).
    Expresion   NVARCHAR(400) NOT NULL,
    -- DIMENSION agrupa; METRICA se agrega.
    Rol         VARCHAR(10) NOT NULL
                CONSTRAINT CK_Campo_Rol CHECK (Rol IN ('DIMENSION','METRICA')),
    TipoDato    VARCHAR(10) NOT NULL DEFAULT 'STRING'
                CONSTRAINT CK_Campo_Tipo CHECK (TipoDato IN ('INT','DECIMAL','STRING','DATE','DATETIME','BOOL')),
    Agregacion  VARCHAR(20) NOT NULL DEFAULT 'NINGUNA'
                CONSTRAINT CK_Campo_Agg CHECK (Agregacion IN ('NINGUNA','SUMA','PROMEDIO','CONTEO','CONTEO_DISTINTO','MIN','MAX')),
    Formato     VARCHAR(12) NOT NULL DEFAULT 'TEXTO'
                CONSTRAINT CK_Campo_Fmt CHECK (Formato IN ('TEXTO','ENTERO','NUMERO','MONEDA','FECHA','PORCENTAJE')),
    Orden       INT NOT NULL DEFAULT 0,
    -- Un campo retirado se marca obsoleto y puede indicar su sustituto, para
    -- que los dashboards antiguos avisen en lugar de romperse.
    Obsoleto    BIT NOT NULL DEFAULT 0,
    ReemplazadoPor NVARCHAR(60) NULL,
    CONSTRAINT UQ_CatalogoCampo UNIQUE (OrigenId, Clave)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CatalogoCampo_Origen' AND object_id = OBJECT_ID('rep.CatalogoCampo'))
CREATE INDEX IX_CatalogoCampo_Origen ON rep.CatalogoCampo(OrigenId);
GO

/* ---------------------------------------------------------------------------
   4) Relaciones entre orígenes (las declaramos nosotros; el usuario no une nada)
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.CatalogoRelacion') IS NULL
CREATE TABLE rep.CatalogoRelacion (
    RelacionId  INT IDENTITY(1,1) PRIMARY KEY,
    OrigenIzqId INT NOT NULL REFERENCES rep.CatalogoOrigen(OrigenId),
    CampoIzq    NVARCHAR(60) NOT NULL,     -- clave lógica del campo
    OrigenDerId INT NOT NULL REFERENCES rep.CatalogoOrigen(OrigenId),
    CampoDer    NVARCHAR(60) NOT NULL,
    -- N1: muchos-a-uno (enriquecer con una dimensión; no duplica importes).
    -- 1N / NN: puede multiplicar filas -> el motor pre-agrega antes de unir.
    Cardinalidad VARCHAR(2) NOT NULL DEFAULT 'N1'
                CONSTRAINT CK_Rel_Card CHECK (Cardinalidad IN ('N1','1N','NN')),
    Activo      BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_CatalogoRelacion UNIQUE (OrigenIzqId, CampoIzq, OrigenDerId, CampoDer)
);
GO

/* ---------------------------------------------------------------------------
   5) Dashboards creados por los usuarios
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.Dashboard') IS NULL
CREATE TABLE rep.Dashboard (
    DashboardId   INT IDENTITY(1,1) PRIMARY KEY,
    Nombre        NVARCHAR(150) NOT NULL,
    Descripcion   NVARCHAR(500) NULL,
    -- Propietario por código de ICG (no todos están en rep.UsuarioApp).
    CodUsuarioICG INT NOT NULL,
    LoginICG      NVARCHAR(60) NULL,
    Area          VARCHAR(10) NOT NULL DEFAULT 'GESTION',
    -- PRIVADO | PERFIL | USUARIOS | PUBLICO
    Visibilidad   VARCHAR(10) NOT NULL DEFAULT 'PRIVADO'
                  CONSTRAINT CK_Dash_Vis CHECK (Visibilidad IN ('PRIVADO','PERFIL','USUARIOS','PUBLICO')),
    -- Widgets, filtros y disposición. Solo referencias lógicas al catálogo.
    -- Nombre propio: CK_Dash_Json ya lo usa rep.DashboardConfig (script 01).
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

/* Con quién se comparte: por perfil o por usuario concreto. */
IF OBJECT_ID('rep.DashboardCompartido') IS NULL
CREATE TABLE rep.DashboardCompartido (
    CompartidoId  INT IDENTITY(1,1) PRIMARY KEY,
    DashboardId   INT NOT NULL REFERENCES rep.Dashboard(DashboardId) ON DELETE CASCADE,
    PerfilId      INT NULL REFERENCES rep.Perfil(PerfilId),
    CodUsuarioICG INT NULL,
    LoginICG      NVARCHAR(60) NULL,
    PuedeEditar   BIT NOT NULL DEFAULT 0,
    FechaCompartido DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    -- Debe apuntar a un perfil o a un usuario, nunca a ambos ni a ninguno.
    CONSTRAINT CK_Comp_Destino CHECK (
        (PerfilId IS NOT NULL AND CodUsuarioICG IS NULL) OR
        (PerfilId IS NULL AND CodUsuarioICG IS NOT NULL))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DashComp_Dashboard' AND object_id = OBJECT_ID('rep.DashboardCompartido'))
CREATE INDEX IX_DashComp_Dashboard ON rep.DashboardCompartido(DashboardId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DashComp_Usuario' AND object_id = OBJECT_ID('rep.DashboardCompartido'))
CREATE INDEX IX_DashComp_Usuario ON rep.DashboardCompartido(CodUsuarioICG);
GO

/* ---------------------------------------------------------------------------
   6) Versiones del catálogo aplicadas (para actualizaciones incrementales)
   --------------------------------------------------------------------------- */
IF OBJECT_ID('rep.CatalogoVersion') IS NULL
CREATE TABLE rep.CatalogoVersion (
    CatalogoVersionId INT IDENTITY(1,1) PRIMARY KEY,
    Paquete     NVARCHAR(60) NOT NULL,     -- ej. 'ICG-BASE'
    Version     INT NOT NULL,
    Descripcion NVARCHAR(300) NULL,
    FechaAplicacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_CatalogoVersion UNIQUE (Paquete, Version)
);
GO

PRINT 'Estructura de catálogo semántico y dashboards creada.';
GO
