# CLAUDE.md — ICG Reportería

Motor de reportes dinámicos sobre el ERP ICG: los usuarios de ICG crean reportes T-SQL parametrizados, los ejecutan sobre la BD de su empresa, los exportan/envían por correo, los programan con cron y arman dashboards semánticos. Backend Node/Express + SQL Server, frontend Vue 3. Nunca escribe en las bases de ICG (salvo el módulo Procedimientos, solo admins).

Documentación completa: @docs/DOCUMENTACION.md

## Comandos

```bash
# Backend (API en :3010)
cd backend && npm install
cd backend && npm run dev          # node --watch src/server.js
cd backend && npm run worker       # planificador de envíos (proceso aparte)
cd backend && npm test             # pruebas unitarias, sin BD
node backend/test/e2e.manual.js    # *.manual.js: necesitan BD real

# Frontend actual (Vite :5173, proxy /api -> :3010)
cd frontend-vue && npm install && npm run dev
cd frontend-vue && npm run build   # dist/ lo sirve el backend en producción

# BD de configuración (siempre con este script: usa sqlcmd -f 65001)
cd db && .\instalar.ps1 -Servidor SRV -Usuario sa -Clave "..."

# Producción Windows (NSSM, PowerShell admin)
cd install && .\instalar-servicios.ps1
```

`.claude/launch.json` define `reporteria-backend`, `reporteria-vue` y `reporteria-frontend` (React legado; mismo puerto 5173 que vue).

## Mapa de arquitectura

- `backend/src/server.js` — Express: login (solo contraseña), sesión en SQL Server, monta `routes/*`, sirve `frontend-vue/dist`.
- `backend/src/worker.js` — cola de jobs en `rep.JobCola` (encola cada minuto, drena cada 5 s, zombis cada 10 min).
- `backend/src/config/index.js` — carga `backend/.env` con ruta fija (no depende del cwd).
- `backend/src/db/connectionManager.js` — singleton con 3 tipos de pool: config (`ICG_Reporteria_Config`), GENERAL (solo lectura) y dataPools por empresa (desde `PATHBD`, TTL).
- `backend/src/db/migraciones.js` — aplica `db/NN_*.sql` pendientes al arrancar; registro en `rep.Migracion`.
- `backend/src/engine/` — `sqlGuard` (validación del SQL de reportes), `queryTemplateEngine` (`{PARAM}` → parámetros enlazados), `reportExecutor` (SIMPLE / MASTER_DETAIL / DASHBOARD), `semanticQuery` (catálogo → T-SQL sin fan-out).
- `backend/src/services/` — `authService` + `icgPassword` (login contra GENERAL), `reporteRepository`/`reporteService`, `exportService` (PDF vía puppeteer/pdfmake, Excel, CSV, HTML, JSON, XML), `mailService`, `schedulerService`/`jobRunner`/`cronUtil`, `auditoriaService`, `versionService`, `catalogo*`, `dashboardService`, `perfilService`, `usuarioService`, `brandingService`, `portabilidadService`, `procedimientoService`, `actualizacionService`, `crypto` (AES-256-GCM).
- `backend/src/routes/*.routes.js` — un router por módulo; cada uno define su propia guarda de permiso junto a sus rutas.
- `frontend-vue/src/` — `api.js` (todas las llamadas), `router/index.js` (guardas por `meta.requierePermiso`), `stores/` (Pinia: session, modal, toasts, reportes), `views/`, `components/reportes/` (ReporteEditor, ReporteViewer, DataGrid), `changelog.js`.
- `db/` — scripts SQL numerados 01..13 (esquema `rep`). `install/` — NSSM, guía de despliegue, script FULL, plantilla de rotación de credenciales.

## Convenciones

- Todo en español: código, comentarios, mensajes de error, commits (`feat:`, `fix:`, `chore: versión X.Y.Z`, `docs:`).
- Toda ruta async va envuelta en `asyncH(...)` (Express 4 no captura promesas rechazadas).
- Toda ruta nueva lleva su guarda (`requireAuth`, `requireEditor` o la específica del router). 401 = sin sesión; 403 = sin permiso. Ocultar un botón en el frontend no es control de acceso.
- Parámetros SQL siempre con `request.input(...)`; nunca concatenar valores de usuario. `DECIMAL` siempre con precisión/escala explícitas (`sqlTypeMapper`).
- El SQL de reportes (escrito, importado o de catálogo) siempre pasa por `sqlGuard.validarSqlReporte`. Si algo no pasa, se corrige el SQL, no se relaja la guarda.
- Fechas: `useUTC: false` (ICG guarda hora local sin zona).
- Cambios de esquema: nuevo `db/NN_nombre.sql` con el número siguiente, idempotente (`IF COL_LENGTH(...) IS NULL`, `IF OBJECT_ID(...) IS NULL`). Scripts de catálogo: `MERGE` filtrado por `Paquete = 'ICG-BASE'`.
- Versión: subir a la vez `backend/package.json`, `frontend-vue/package.json` y `frontend-vue/src/changelog.js` (`APP_VERSION` + entrada). Tag `vX.Y.Z`.
- Comentarios: explican decisiones de diseño, no sintaxis. Simplificaciones deliberadas marcadas con `ponytail:`.

## Trampas / no obvio

- Login **solo por contraseña**: la clave identifica al usuario en `GENERAL.USUARIOS.NEWPASS` (cifrado ICG reversible, `icgPassword.js`). Se descifran todos y se compara en Node (caché 2 min).
- `ADMIN_LOGINS` en `.env` siempre da rol Administrador (bootstrap); sin registro en `rep.UsuarioApp` el usuario es *Lectura*.
- Reportes GESTION usan la empresa activa de la sesión; CONTABLE requieren empresa + ejercicio. El permiso se revalida en servidor con `assertEmpresaPermitida`.
- Los jobs programados se ejecutan con los permisos del usuario que creó la programación.
- `pdfmake` debe quedarse en **0.2.x** (0.3 rompe `new PdfPrinter`). Chromium vive en `backend/.cache/puppeteer` (servicio LocalSystem). PDF máx. 500 filas.
- Los scripts `db/` corren UNA vez (los MERGE pisarían ediciones de usuarios). 01–12 son baseline en instalaciones previas a `rep.Migracion`.
- Caché de catálogo 5 min por proceso; invalidar al guardar (`catalogoAdminService` ya lo hace). Tras editar `rep.ServidorCredencial` llamar `cm.clearCredCache()`.
- `frontend-vue`: Dashboards, Perfiles, Portabilidad y Programaciones son stubs "en construcción"; la implementación de referencia está en `frontend/` (React legado).
- `.sql` con acentos: ejecutar con `instalar.ps1` o `sqlcmd -f 65001`.

## Qué NO hacer

- No escribir en las BDs de ICG (GENERAL ni empresas) salvo el flujo explícito de Procedimientos.
- No ejecutar pruebas `*.manual.js`, migraciones ni `ALTER` contra servidores de clientes/producción.
- No commitear `backend/.env`, `backend/test-conn.js`, `*.zip` de release, `backend/.cache/`, `logs/`, `dist/`.
- No cambiar `APP_CRYPTO_KEY` en una instalación existente: los passwords guardados en BD dejarían de descifrarse.
- No subir `pdfmake` a 0.3, no quitar `useUTC: false`, no relajar `sqlGuard`.
- No editar scripts `db/` ya publicados: crear uno nuevo.
- No hacer `git push` ni publicar releases sin pedirlo.
