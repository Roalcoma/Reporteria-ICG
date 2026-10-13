# Despliegue en Windows (servicios NSSM)

Corren **dos servicios** Node: la **API** (que también sirve la interfaz web) y el
**worker** de envíos programados. En producción **no se usa Vite**: todo queda en
un solo puerto (`PORT`, por defecto 3010).

## 1. Requisitos
- Node.js LTS instalado para todos los usuarios (`C:\Program Files\nodejs`).
- SQL Server (la instalación de ICG). SQL Express basta para `ICG_Reporteria_Config`.
- NSSM: https://nssm.cc/download → copiar `nssm.exe` a `C:\nssm\`.
- Acceso a internet desde el servidor (GitHub y npm) para instalar y actualizar.

## 2. Primera instalación
```powershell
# 1) Código
git clone https://github.com/Roalcoma/Reporteria-ICG.git C:\apps\ICG_Reporteria

# 2) Base de configuración (crea la BD y aplica todos los scripts)
cd C:\apps\ICG_Reporteria\db
.\instalar.ps1 -Servidor MISERVIDOR -Usuario sa -Clave "..."

# 3) Variables de entorno
cd ..\backend
Copy-Item .env.example .env   # completar: DB_*, SESSION_SECRET, APP_CRYPTO_KEY, GITHUB_REPO

# 4) Dependencias, build y servicios (PowerShell como administrador)
cd ..\install
.\instalar-servicios.ps1
```
Abrir `http://SERVIDOR:3010`. Si se accede desde otras PCs, permitir el puerto en
el Firewall de Windows. Logs en `C:\apps\ICG_Reporteria\logs\`.

## 3. Actualizaciones
Desde la app: **Actualización → Descargar e instalar** (rol Administrador).

1. Descarga la última release de `GITHUB_REPO`.
2. Instala dependencias y compila en una carpeta temporal (la instalación en uso no se toca).
3. Backup en `..\ICG_Reporteria_backups\` (se conservan los 3 últimos) y copia de archivos.
   Si la copia falla, se restaura el backup.
4. API y worker se reinician solos (NSSM) y la API aplica las migraciones SQL pendientes
   de `db/` al arrancar (registro en `rep.Migracion`; estado en `/api/health`).

Publicar una versión: subir `version` en `backend/package.json` y `frontend-vue/package.json`,
crear el tag `vX.Y.Z` y la release en GitHub. Un script SQL nuevo va en `db/` con el
número siguiente (`14_...sql`) y debe ser idempotente.

## PDF: "No se encontró Chromium"
El PDF usa Chromium, que se guarda en `backend\.cache\puppeteer` (no en el perfil del
usuario: el servicio corre como LocalSystem y no lo vería). Si falta:
```powershell
cd C:\apps\ICG_Reporteria\backend
npx puppeteer browsers install chrome
Restart-Service ICG_Reporteria_API, ICG_Reporteria_Worker
```

## 4. Login SQL de solo lectura (recomendado)
```sql
CREATE LOGIN readonly_rep WITH PASSWORD = 'una-clave-fuerte';
-- En GENERAL y en cada base de empresa ICG:
--   CREATE USER readonly_rep FOR LOGIN readonly_rep;
--   ALTER ROLE db_datareader ADD MEMBER readonly_rep;
```
Se registra por servidor en `rep.ServidorCredencial`.

## 5. HTTPS (opcional)
IIS + ARR + URL Rewrite (o nginx) como proxy inverso hacia `http://localhost:3010`.
