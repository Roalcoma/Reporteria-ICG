/* ============================================================================
   ICG_Reporteria_Config — Preferencias de impresión (PDF) por reporte
   Ejecutar DESPUÉS de 11_catalogo_fechas.sql.  Baseline: SQL Server 2016.

   Cada reporte guarda cómo debe salir en PDF (orientación y tamaño de hoja),
   de modo que quien lo consulta no tenga que elegirlo cada vez. Al exportar se
   puede cambiar puntualmente sin alterar el valor por defecto.
   ============================================================================ */
USE ICG_Reporteria_Config;
GO

IF COL_LENGTH('rep.Reporte', 'OrientacionPdf') IS NULL
    ALTER TABLE rep.Reporte ADD OrientacionPdf VARCHAR(10) NOT NULL
        CONSTRAINT DF_Reporte_Orientacion DEFAULT 'VERTICAL';
GO
IF COL_LENGTH('rep.Reporte', 'TamanoHoja') IS NULL
    ALTER TABLE rep.Reporte ADD TamanoHoja VARCHAR(10) NOT NULL
        CONSTRAINT DF_Reporte_Hoja DEFAULT 'A4';
GO

/* Se validan por CHECK para que solo entren valores que el generador entiende. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reporte_Orientacion')
    ALTER TABLE rep.Reporte ADD CONSTRAINT CK_Reporte_Orientacion
        CHECK (OrientacionPdf IN ('VERTICAL','HORIZONTAL'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reporte_Hoja')
    ALTER TABLE rep.Reporte ADD CONSTRAINT CK_Reporte_Hoja
        CHECK (TamanoHoja IN ('A4','A3','LETTER','LEGAL','TABLOID'));
GO

/* El PDF también debe poder programarse como adjunto de un envío automático. */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Prog_Fmt')
    ALTER TABLE rep.Programacion DROP CONSTRAINT CK_Prog_Fmt;
GO
ALTER TABLE rep.Programacion ADD CONSTRAINT CK_Prog_Fmt
    CHECK (FormatoExportacion IN ('CSV','EXCEL','JSON','XML','HTML','PDF'));
GO

/* Y la columna del historial debe admitir el nombre completo del formato. */
IF COL_LENGTH('rep.EnvioCorreoHistorial', 'FormatoAdjunto') IS NOT NULL
    ALTER TABLE rep.EnvioCorreoHistorial ALTER COLUMN FormatoAdjunto VARCHAR(10) NULL;
GO

PRINT 'Preferencias de impresion PDF anadidas a rep.Reporte y rep.Programacion.';
GO
