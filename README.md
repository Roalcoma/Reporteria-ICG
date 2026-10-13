# ICG Reportería

Motor de reportes dinámicos integrado sobre el ERP ICG. Permite crear, ejecutar y auditar reportes directamente sobre las bases de datos de empresa sin modificar el sistema fuente.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 20 + Express 4 |
| Base de datos | SQL Server — `tedious` / `mssql` |
| Frontend | Vue 3 + Vite 5 |
| Estado | Pinia |
| Editor SQL | CodeMirror 6 |
| Sesiones | `express-session` + MSSQL session store |

---

## Características

- **Reportes dinámicos** — tipos `SIMPLE`, `MASTER_DETAIL` y `DASHBOARD` con parámetros tipados (texto, fecha, select, lista SQL dinámica)
- **Editor SQL** — CodeMirror 6 con syntax highlighting, line wrapping y modo solo-lectura
- **Módulo Procedimientos** — explora y edita Stored Procedures y Vistas de la BD de empresa en tiempo real
- **Auditoría completa** — bitácora de eventos con filtros por tipo, usuario, fecha y resultado
- **Programaciones** — ejecución programada de reportes vía cron
- **Actualización automática** — descarga e instala nuevas versiones desde GitHub Releases
- **Multi-empresa** — soporte para múltiples empresas ICG con acceso controlado por usuario
- **Modal de confirmación** — sistema de modales reactivo con Pinia para acciones destructivas

---

## Instalación

### Requisitos

- Node.js ≥ 20
- SQL Server 2019+
- Acceso a la base de datos del ERP ICG

### 1. Clonar el repositorio

```bash
git clone https://github.com/Roalcoma/Reporteria-ICG.git
cd Reporteria-ICG
```

### 2. Instalar dependencias

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend-vue && npm install
```

### 3. Configurar variables de entorno

Copiar `backend/.env.example` a `backend/.env` y completar `DB_SERVER`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET`, `APP_CRYPTO_KEY` y `GITHUB_REPO`.

### 4. Inicializar la base de datos

```powershell
cd db
.\instalar.ps1 -Servidor MISERVIDOR -Usuario sa -Clave "..."
```

Crea `ICG_Reporteria_Config` y aplica todos los scripts. Después, los scripts nuevos de `db/` los aplica el backend solo al arrancar (`rep.Migracion`).

### 5. Producción (servicios de Windows)

```powershell
cd install
.\instalar-servicios.ps1     # npm ci, build del frontend y servicios NSSM
```

La aplicación completa queda en `http://SERVIDOR:3010`: el backend sirve también la interfaz. Detalle en [`install/windows-service.md`](install/windows-service.md).

### 6. Desarrollo

```bash
cd backend && npm run dev          # API en :3010
cd frontend-vue && npm run dev     # Vite en :5173 con proxy a /api
```

---

## Módulos

### Reportes

Los reportes se definen con una consulta SQL principal y parámetros configurables. Tres tipos disponibles:

| Tipo | Descripción |
|------|-------------|
| `SIMPLE` | Tabla plana con filtros |
| `MASTER_DETAIL` | Hasta 3 niveles de anidamiento (cabecera + detalles) |
| `DASHBOARD` | Múltiples reportes agrupados en una sola vista |

Los parámetros pueden ser texto libre, fecha, lista fija o lista dinámica generada por una consulta SQL.

### Procedimientos

Explora y edita Stored Procedures y Vistas de la base de datos de la empresa activa directamente desde el navegador. El editor usa CodeMirror 6 con syntax highlighting SQL completo. Las modificaciones se aplican vía `ALTER PROCEDURE` / `ALTER VIEW`. Requiere permiso `PuedeCrear`.

### Auditoría

Registra todos los eventos de la aplicación: login, ejecución de reportes, creación, modificación y eliminación. Filtros por tipo de evento, usuario, fecha desde/hasta y resultado (exitoso/fallido).

### Programaciones

Define expresiones cron para ejecutar reportes automáticamente. Configurable por empresa y reporte.

### Actualización automática

Consulta GitHub Releases para detectar nuevas versiones. Los administradores pueden descargar e instalar actualizaciones desde la interfaz web sin acceso al servidor.

---

## Roles y permisos

Los permisos viven en `rep.AppRol`. Roles de fábrica: **Lectura**, **Creador/Editor** y **Administrador**. Un usuario de ICG sin registrar entra como Lectura; los logins de `ADMIN_LOGINS` (`.env`) siempre son Administrador.

| Permiso | Habilita |
|---------|----------|
| `PuedeEjecutar` | Ejecutar, exportar y enviar por correo reportes existentes |
| `PuedeCrear` / `PuedeEditar` | Crear y editar reportes, carpetas y guardar la vista de un reporte. `PuedeCrear` además autoriza SP y aplica `ALTER` en Procedimientos |
| `PuedeProgramar` | Programaciones, Auditoría y acceso al módulo Procedimientos |
| `PuedeAdministrar` | Branding, Usuarios, Perfiles, Portabilidad y Actualización |

---

## Estructura del proyecto

```
Reporteria-ICG/
├── backend/
│   ├── src/
│   │   ├── routes/          # Express routers por módulo
│   │   ├── services/        # Lógica de negocio y acceso a BD
│   │   └── middleware/      # Auth, error handling
│   └── .env                 # Variables de entorno (no incluido)
├── frontend-vue/
│   ├── src/
│   │   ├── views/           # Vistas principales (una por módulo)
│   │   ├── components/      # Componentes reutilizables
│   │   ├── stores/          # Pinia stores (session, modal, toast)
│   │   ├── api.js           # Capa de llamadas HTTP
│   │   └── changelog.js     # Historial de versiones
│   └── vite.config.js
└── db/                      # Scripts SQL de inicialización
```

---

## Versión actual

`0.8.0` — Un solo puerto en producción, migraciones automáticas y actualizador con backup y reinicio. La versión se declara en `backend/package.json` (la usa el actualizador) y `frontend-vue/package.json`; el tag del release debe ser `v<versión>`.

Historial completo en [`frontend-vue/src/changelog.js`](frontend-vue/src/changelog.js).

---

## Desarrollado por

**Redes IP** — uso interno  
Rodrigo Alfonzo · 2026
