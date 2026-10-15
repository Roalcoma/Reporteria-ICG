# ICG Reportería

Motor de reportes dinámicos integrado sobre el ERP ICG. Permite crear, ejecutar, exportar, programar y auditar reportes directamente sobre las bases de datos de empresa **sin modificar el sistema fuente**: todo lo propio vive en una base de configuración aparte (`ICG_Reporteria_Config`).

---

## Funcionalidades

- **Reportes dinámicos** — tipos `SIMPLE`, `MASTER_DETAIL` (hasta 3 niveles) y `DASHBOARD`, con parámetros tipados (texto, fecha, booleano, lista fija o lista generada por SQL). Los valores siempre viajan como parámetros enlazados.
- **Editor SQL** — CodeMirror 6 con resaltado; validación de seguridad (`sqlGuard`): una sola sentencia `SELECT`/`WITH` o `EXEC esquema.sp @p = {PARAM}`.
- **Exportación** — PDF, Excel, CSV, HTML, JSON y XML respetando formatos y alias de columna, con branding por empresa.
- **Envío por correo** — a demanda o programado (cron) con adjunto; configuración SMTP desde la app.
- **Programaciones** — worker independiente con cola en SQL Server (sin SQL Agent ni Redis), reintentos y recuperación de jobs colgados.
- **Dashboards semánticos** — catálogo de orígenes y campos lógicos para armar paneles sin escribir SQL.
- **Auditoría y versionado** — bitácora de eventos y snapshots de cada cambio de un reporte con comparación entre versiones.
- **Procedimientos** — explorar y editar SPs, vistas y funciones de la BD de empresa (`ALTER`). **Solo administradores.**
- **Perfiles, usuarios y roles** — los usuarios son los de ICG; la app asigna roles y perfiles de reportes.
- **Portabilidad** — exportar/importar definiciones como JSON (`icg-reporteria/v1`) entre instalaciones.
- **Multi-empresa** — empresas de gestión y contables (por ejercicio) según los permisos de ICG.
- **Actualización automática** — descarga desde GitHub Releases, compila en staging, hace backup y reinicia los servicios.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 20 + Express 4 |
| Base de datos | SQL Server 2019+ — `mssql` (tedious) |
| Sesiones | `express-session` + `connect-mssql-v2` |
| Jobs | `node-cron`, `cron-parser` |
| Exportación | `exceljs`, `pdfmake` 0.2, `puppeteer` |
| Correo | `nodemailer` |
| Frontend | Vue 3 + Vite 5 + Pinia + vue-router |
| Editor SQL | CodeMirror 6 |
| Producción | Servicios de Windows con NSSM |

---

## Requisitos

- Node.js ≥ 20
- SQL Server 2019+ (SQL Express basta para la base de configuración)
- Acceso a la base `GENERAL` y a las bases de empresa del ERP ICG
- Producción: Windows Server + [NSSM](https://nssm.cc/download)

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Roalcoma/Reporteria-ICG.git
cd Reporteria-ICG
```

### 2. Instalar dependencias

```bash
cd backend && npm install
cd ../frontend-vue && npm install
```

### 3. Variables de entorno

Copiar `backend/.env.example` a `backend/.env` y completar:

```dotenv
# SQL Server (config, GENERAL y credencial de datos por defecto)
DB_SERVER=MISERVIDOR\SQLEXPRESS
DB_USER=usuario_reporteria
DB_PASSWORD=cambia-esta-clave

CONFIG_DB_NAME=ICG_Reporteria_Config
GENERAL_DB_NAME=GENERAL

# Llave AES-256 (64 caracteres hex) para passwords guardados en la BD
APP_CRYPTO_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

PORT=3010
SESSION_SECRET=un-texto-largo-y-aleatorio
CORS_ORIGIN=http://localhost:5173

DATA_POOL_MAX=10
DATA_POOL_IDLE_MINUTES=30
QUERY_TIMEOUT_MS=120000

WORKER_ID=worker-1

# Logins ICG que siempre son administradores (separados por ;)
ADMIN_LOGINS=SUPERVISOR
# CODUSUARIO de ICG que administran el catálogo semántico (separados por ;)
CATALOGO_ADMIN_CODUSUARIOS=0

# owner/repo para el actualizador (vacío = deshabilitado)
GITHUB_REPO=miempresa/ICG_Reporteria
# ACTUALIZACION_REINICIAR=1   # lo define instalar-servicios.ps1 en los servicios NSSM
```

Genera una `APP_CRYPTO_KEY` propia por instalación y no la cambies después: los passwords guardados en la BD dejarían de poder descifrarse.

### 4. Inicializar la base de datos

```powershell
cd db
.\instalar.ps1 -Servidor MISERVIDOR -Usuario sa -Clave "..."
```

Crea `ICG_Reporteria_Config` y aplica todos los scripts (con `sqlcmd -f 65001`, para que no se corrompan los acentos). Los scripts nuevos de `db/` los aplica el backend solo al arrancar (`rep.Migracion`).

---

## Ejecución (desarrollo)

```bash
cd backend && npm run dev          # API en :3010
cd backend && npm run worker       # envíos programados (opcional)
cd frontend-vue && npm run dev     # Vite en :5173 con proxy a /api
cd backend && npm test             # pruebas unitarias
```

---

## Despliegue (servicios de Windows)

```powershell
cd install
.\instalar-servicios.ps1     # npm ci, Chromium para PDF, build del frontend y servicios NSSM
```

Crea los servicios `ICG_Reporteria_API` e `ICG_Reporteria_Worker`. La aplicación completa queda en `http://SERVIDOR:3010`: el backend sirve también la interfaz. Detalle en [`install/windows-service.md`](install/windows-service.md).

**Publicar una versión:** subir `version` en `backend/package.json` y `frontend-vue/package.json`, añadir la entrada en `frontend-vue/src/changelog.js`, crear el tag `vX.Y.Z` y la release en GitHub. Un script SQL nuevo va en `db/` con el número siguiente y debe ser idempotente.

---

## Roles y permisos

Los permisos viven en `rep.AppRol`. Roles de fábrica: **Lectura**, **Creador/Editor** y **Administrador**. Un usuario de ICG sin registrar entra como Lectura; los logins de `ADMIN_LOGINS` siempre son Administrador.

| Permiso | Habilita |
|---------|----------|
| `PuedeEjecutar` | Ejecutar, exportar y enviar por correo reportes existentes |
| `PuedeCrear` / `PuedeEditar` | Crear y editar reportes (incluidos los basados en SP), carpetas y guardar la vista de un reporte |
| `PuedeCrearDashboards` | Crear y compartir dashboards semánticos |
| `PuedeProgramar` | Programaciones y Auditoría |
| `PuedeAdministrar` | Procedimientos, Branding, Usuarios, Perfiles, Portabilidad y Actualización |

---

## Estructura del proyecto

```
Reporteria-ICG/
├── backend/
│   ├── src/
│   │   ├── server.js        # API Express (sirve también frontend-vue/dist)
│   │   ├── worker.js        # Planificador de envíos programados
│   │   ├── config/          # Carga de .env
│   │   ├── db/              # Pools de conexión y migraciones
│   │   ├── engine/          # sqlGuard, plantillas de parámetros, ejecutores, consulta semántica
│   │   ├── routes/          # Routers Express por módulo
│   │   ├── services/        # Lógica de negocio y acceso a BD
│   │   └── middleware/      # Autenticación
│   ├── test/                # Pruebas (npm test) y pruebas manuales contra BD
│   └── .env.example
├── frontend-vue/            # Interfaz Vue 3 (actual)
├── frontend/                # Interfaz React (legado)
├── db/                      # Scripts SQL numerados + instalar.ps1
├── install/                 # Servicios NSSM, guía de despliegue, scripts SQL
└── docs/                    # Documentación técnica
```

Documentación técnica completa: [`docs/DOCUMENTACION.md`](docs/DOCUMENTACION.md).

---

## Versión actual

`0.8.2` — Exportación a PDF funcionando como servicio de Windows (Chromium en `backend/.cache/puppeteer`) y errores de exportación detallados. Historial completo en [`frontend-vue/src/changelog.js`](frontend-vue/src/changelog.js).

---

## Desarrollado por

**Redes IP** — uso interno
Rodrigo Alfonzo · 2026
