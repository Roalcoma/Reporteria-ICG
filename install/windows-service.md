# Despliegue como servicio de Windows (sin licencias, sin Docker)

Se ejecutan **dos servicios** Node: la **API** y el **worker** del scheduler.
Se usa **NSSM** (the Non-Sucking Service Manager, gratuito) para registrarlos.

## 1. Requisitos
- Node.js LTS (gratuito) instalado en el servidor.
- SQL Server ya presente (la instalacion de ICG). **SQL Express basta** para
  `ICG_Reporteria_Config`; agregar una BD **no suma licencia**.
- NSSM: https://nssm.cc/download (copiar `nssm.exe` a `C:\nssm\`).

## 2. Preparar la app
```powershell
cd C:\apps\ICG_Reporteria\backend
npm install --omit=dev
Copy-Item .env.example .env   # y editar valores reales
```

## 3. Crear el login SQL de SOLO LECTURA (defensa en profundidad)
Ejecutar en SQL Server (una vez por instancia de datos ICG):
```sql
CREATE LOGIN readonly_rep WITH PASSWORD = 'una-clave-fuerte';
-- En CADA base de datos que la reporteria vaya a leer (GENERAL y las de empresas):
--   CREATE USER readonly_rep FOR LOGIN readonly_rep;
--   ALTER ROLE db_datareader ADD MEMBER readonly_rep;
```

## 4. Registrar los servicios con NSSM
```powershell
# API
C:\nssm\nssm.exe install ICG_Reporteria_API "C:\Program Files\nodejs\node.exe" "C:\apps\ICG_Reporteria\backend\src\server.js"
C:\nssm\nssm.exe set ICG_Reporteria_API AppDirectory "C:\apps\ICG_Reporteria\backend"
C:\nssm\nssm.exe set ICG_Reporteria_API Start SERVICE_AUTO_START

# Worker (scheduler). Se puede registrar mas de uno (WORKER_ID distinto) para escalar.
C:\nssm\nssm.exe install ICG_Reporteria_Worker "C:\Program Files\nodejs\node.exe" "C:\apps\ICG_Reporteria\backend\src\worker.js"
C:\nssm\nssm.exe set ICG_Reporteria_Worker AppDirectory "C:\apps\ICG_Reporteria\backend"

Start-Service ICG_Reporteria_API, ICG_Reporteria_Worker
```

## 5. Proxy inverso / HTTPS (elige uno)
- **IIS + ARR + URL Rewrite** (ya viene con Windows Server): reverse proxy a
  `http://localhost:3010`, con certificado en IIS.
- **nginx** (gratuito) si prefieres no usar IIS.

## Notas
- El worker NO necesita SQL Agent (no existe en Express): la cola vive en
  `rep.JobCola` y se drena por polling con `UPDLOCK, READPAST`.
- Para varios workers concurrentes: registra `ICG_Reporteria_Worker2` con
  `WORKER_ID=worker-2` en su `.env` o variable de entorno del servicio.
