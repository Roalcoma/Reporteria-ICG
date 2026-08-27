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

Crear `backend/.env`:

```env
DB_SERVER=tu-servidor
DB_DATABASE=reporteria
DB_USER=usuario
DB_PASSWORD=contraseña
SESSION_SECRET=clave-secreta-larga
PORT=3010
```

### 4. Inicializar la base de datos

Ejecutar los scripts en la carpeta `db/` en orden numérico sobre una BD SQL Server vacía llamada `reporteria`.

### 5. Levantar el sistema

```bash
# Backend (producción)
cd backend && npm start

# Frontend — desarrollo
cd frontend-vue && npm run dev

# Frontend — build de producción
cd frontend-vue && npm run build
```

El frontend de desarrollo queda en `http://localhost:5173` y el backend en `http://localhost:3010`.

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

| Permiso | Descripción |
|---------|-------------|
| `PuedeEjecutar` | Ejecutar reportes existentes |
| `PuedeEditar` | Crear y modificar reportes y carpetas |
| `PuedeCrear` | Administrar procedimientos y configuración avanzada |
| `PuedeAdmin` | Gestión de usuarios y actualización del sistema |

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

`0.7.0` — Editor SQL CodeMirror 6 + Módulo Procedimientos + fix AppModal

Historial completo en [`frontend-vue/src/changelog.js`](frontend-vue/src/changelog.js).

---

## Desarrollado por

**Redes IP** — uso interno  
Rodrigo Alfonzo · 2026
