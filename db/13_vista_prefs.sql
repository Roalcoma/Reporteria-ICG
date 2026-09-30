-- Agrega columna VistaJson a rep.Reporte para persistir preferencias de vista
-- (orden de columnas, agrupación, alias, totales, formatos) compartidas entre usuarios.
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('rep.Reporte') AND name = 'VistaJson')
    ALTER TABLE rep.Reporte ADD VistaJson NVARCHAR(MAX) NULL;
GO
