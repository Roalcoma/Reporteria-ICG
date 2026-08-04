/* ============================================================================
   ROTACIÓN DE CREDENCIALES — plantilla

   Cambia la contraseña de los dos logins SQL de la herramienta. Es la misma
   operación que se hace al instalar en un cliente nuevo o ante una sospecha de
   filtración.

   USO
   ---
   1. Genere dos contraseñas nuevas. Evite  #  $  '  "  y espacios: `dotenv`
      los interpreta y el login falla de forma silenciosa. Por ejemplo:

        -join (1..32 | % { ([char[]](48..57+65..90+97..122) | Get-Random) })

   2. Sustituya los marcadores de abajo, ejecute el script y actualice
      backend/.env con los MISMOS valores.
   3. Reinicie el API y el worker.
   4. BORRE su copia rellenada de este archivo. Nunca la versione.

   Ambos logins son de mínimo privilegio y no deben acumular más permisos:
     · icg_reporteria_app  lectura/escritura SOLO en ICG_Reporteria_Config.
     · readonly_rep        db_datareader en GENERAL y en las BD de empresas.
                           Es el muro real contra escrituras.
   ============================================================================ */

USE master;
GO

ALTER LOGIN icg_reporteria_app WITH PASSWORD = '<<CONFIG_DB_PASSWORD>>';
GO

ALTER LOGIN readonly_rep       WITH PASSWORD = '<<DATA_DB_DEFAULT_PASSWORD>>';
GO

SELECT  name,
        is_disabled,
        LOGINPROPERTY(name, 'IsLocked')            AS Bloqueado,
        LOGINPROPERTY(name, 'PasswordLastSetTime') AS UltimoCambio
FROM sys.sql_logins
WHERE name IN ('icg_reporteria_app', 'readonly_rep');
GO

PRINT 'Credenciales rotadas. Reinicie el API y el worker para que tomen el .env nuevo.';
GO
