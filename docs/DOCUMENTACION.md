# ICG Reportería — Documentación técnica

> Versión del código documentada: **0.8.2** (`backend/package.json`, `frontend-vue/package.json`, `frontend-vue/src/changelog.js`).
> Existe además un documento técnico en PDF (`docs/ICG_Reporteria_Documento_Tecnico.pdf`) que se regenera con `node docs/generar-documento.js`.

## 1. Propósito y contexto de negocio

ICG Reportería es un **motor de reportes dinámicos sobre el ERP ICG** (FrontRest/FrontRetail/Manager). Permite a los usuarios de ICG:

- Crear reportes T-SQL parametrizados (tipos `SIMPLE`, `MASTER_DETAIL`, `DASHBOARD`) y ejecutarlos contra la base de datos de su empresa.
- Exportarlos (PDF, Excel, CSV, HTML, JSON, XML) y enviarlos por correo, a demanda o programados con cron.
- Armar dashboards sin SQL a partir de un **catálogo semántico** (orígenes y campos lógicos).
- Auditar todo lo que pasa (logins, ejecuciones, cambios, SQL rechazado) y versionar las definiciones.

Principio rector: **nunca se escribe en las bases de ICG**. Todo lo propio vive en una BD aparte (`ICG_Reporteria_Config`, esquema `rep`). Los usuarios y los permisos por empresa se leen de `GENERAL` de ICG. La única excepción deliberada es el módulo **Procedimientos** (solo administradores), que puede aplicar `ALTER` a SPs/vistas/funciones de la BD de empresa.

Desarrollado por Redes IP (uso interno), autor Rodrigo Alfonzo.

## 2. Arquitectura y flujo de datos

```
Navegador (Vue 3 SPA)
   │  fetch /api/*  (cookie de sesión, credentials: include)
   ▼
API Express  (backend/src/server.js, puerto PORT=3010)
   │  sirve también frontend-vue/dist en producción
   ├── configPool  ──► ICG_Reporteria_Config (esquema rep)  — lectura/escritura
   ├── generalPool ──► GENERAL de ICG                        — solo lectura (usuarios, empresas, permisos)
   └── dataPools   ──► BD de cada empresa ICG                 — creados al vuelo desde PATHBD, TTL, readOnlyIntent

Worker (backend/src/worker.js, proceso separado)
   ├── cada minuto   → encola rep.Programacion vencidas en rep.JobCola
   ├── cada 5 s      → reclama jobs (UPDLOCK+READPAST) → ejecuta → exporta → envía correo
   └── cada 10 min   → recupera jobs "zombi" (worker caído)
```

### Flujo de login
1. `POST /api/login` recibe **solo la contraseña** (patrón ICG: la clave identifica al usuario).
2. `authService.loginPorPassword` lee `GENERAL.dbo.USUARIOS` (activos, no bloqueados, con `NEWPASS`; caché 2 min), descifra cada `NEWPASS` con el cifrado propietario ICG (`services/icgPassword.js`, clave `NORMALKEY`) y busca coincidencias. 0 → error; >1 → error "contraseña duplicada".
3. Rol: `rep.UsuarioApp` + `rep.AppRol`. Si no está registrado → rol *Lectura*. Logins en `ADMIN_LOGINS` → siempre Administrador (bootstrap/recuperación).
4. Empresas permitidas: `GENERAL.dbo.EMPRESASUSUARIO` + `EMPRESAS` (gestión) y `EMPRESASCONTAUSUARIO` + `EMPRESASCONTABLES` (contables, por ejercicio). El destino servidor/BD sale de `PATHBD` (`SERVIDOR:BASEDATOS`).
5. Sesión en SQL Server (`connect-mssql-v2`, tabla `dbo.sessions` en la BD de config). Rate limit: 20 intentos / 15 min por IP.

### Flujo de ejecución de un reporte
1. `POST /api/reportes/:id/ejecutar` → `reporteService.ejecutar`.
2. Carga la definición completa (`reporteRepository.getReporteFull`: reporte, consultas, parámetros, opciones, columnas).
3. Reportes `GESTION` usan la empresa activa de la sesión; `CONTABLE` exigen empresa + ejercicio. `authService.assertEmpresaPermitida` revalida el permiso en el servidor.
4. `engine/reportExecutor.js` elige ejecutor por tipo; `engine/queryTemplateEngine.js` convierte `{PARAM}` en parámetros enlazados (`request.input`), nunca concatenados. Parámetros multi-valor viajan con separador `§` y `STRING_SPLIT`.
5. `engine/sqlGuard.js` valida el SQL antes: una sola sentencia, debe empezar por `SELECT`/`WITH` o ser `EXEC esquema.sp @p = {PARAM}`; lista negra de DML/DDL/seguridad/IO; bloquea `sp_`/`xp_`.
6. Se registra en `rep.EjecucionLog` y en auditoría.

### Dashboards semánticos
`engine/semanticQuery.js` traduce una selección de claves lógicas (`ORIGEN.CAMPO`) del catálogo (`rep.CatalogoOrigen/Campo/Relacion`) a T-SQL. Para evitar el *fan-out* agrega cada origen de hechos por separado y une después por dimensiones comunes. Soporta periodos relativos (HOY, AYER, SEMANA_ACTUAL, semana pasada, mes…) resueltos en el servidor. El catálogo se cachea 5 min por proceso.

## 3. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js ≥ 20, Express 4, `mssql` 11 (tedious), `express-session` + `connect-mssql-v2`, `express-rate-limit`, `cors`, `dotenv` |
| Jobs | `node-cron` (relojes del worker), `cron-parser` (próxima ejecución) |
| Exportación | `exceljs` (Excel), `pdfmake` **0.2.x** (no subir a 0.3), `puppeteer` (PDF vía Chromium), generación propia de CSV/HTML/JSON/XML |
| Correo | `nodemailer` (config SMTP en BD, password cifrado AES-256-GCM) |
| Frontend actual | Vue 3, Vite 5, Pinia, vue-router 4, CodeMirror 6 (`@codemirror/lang-sql`), `@tanstack/vue-table`, `@tanstack/vue-virtual` |
| Frontend legado | `frontend/`: React 18 + Vite + Monaco + ECharts + react-pivottable (aún versionado) |
| BD | SQL Server 2019+ (SQL Express sirve para la BD de config) |
| Despliegue | Servicios de Windows con NSSM; actualizador desde GitHub Releases |

## 4. Estructura de carpetas

```
ICG_Reporteria/
├── backend/
│   ├── src/
│   │   ├── server.js              # API Express: auth, sesión, montaje de rutas, sirve frontend-vue/dist
│   │   ├── worker.js              # Planificador/cola de envíos programados (proceso aparte)
│   │   ├── config/index.js        # Carga backend/.env con ruta fija; pools, roles bootstrap
│   │   ├── db/connectionManager.js# Singleton: configPool, generalPool, dataPools con TTL
│   │   ├── db/migraciones.js      # Aplica db/NN_*.sql pendientes al arrancar (rep.Migracion)
│   │   ├── engine/                # queryTemplateEngine, reportExecutor, semanticQuery, sqlGuard, sqlTypeMapper
│   │   ├── middleware/auth.js     # requireAuth, requireEditor, asyncH
│   │   ├── routes/*.routes.js     # Un router por módulo (cada uno declara su guarda de permiso)
│   │   └── services/*.js          # Lógica de negocio y acceso a BD
│   ├── test/                      # *.test.js (npm test) y *.manual.js (requieren BD real)
│   ├── .puppeteerrc.cjs           # Caché de Chromium en backend/.cache/puppeteer
│   └── .env.example
├── frontend-vue/                  # Interfaz actual (Vue 3)
│   └── src/{views,components,stores,router,composables,api.js,changelog.js,format.js}
├── frontend/                      # Interfaz anterior en React (legado)
├── db/                            # Scripts SQL numerados 01..13 + instalar.ps1
├── install/                       # instalar-servicios.ps1 (NSSM), windows-service.md,
│                                  # ICG_Reporteria_Config_FULL.sql, rotar-credenciales.sql (plantilla)
└── docs/                          # Documento técnico PDF + generador
```

## 5. Módulos principales (backend/src/services)

| Servicio | Responsabilidad |
|---|---|
| `authService` | Login por contraseña contra GENERAL, rol de app, empresas de gestión/contables, `assertEmpresaPermitida`, `parsePathBd` |
| `icgPassword` | Cifrado/descifrado propietario de contraseñas ICG (`NEWPASS`) |
| `reporteRepository` | CRUD de definiciones en `rep.*` (carpetas, reportes, consultas, parámetros, columnas) |
| `reporteService` | Orquesta ejecución: permisos de empresa, destino, ejecutor, log |
| `exportService` | PDF/Excel/CSV/HTML/JSON/XML desde `{columnas, filas}` respetando formatos y alias; devuelve buffers, no escribe en disco. PDF máx. 500 filas |
| `mailService` | Envío SMTP con adjunto y registro en `rep.EnvioCorreoHistorial` |
| `schedulerService` / `jobRunner` / `cronUtil` | Cola en BD, reclamo atómico, pipeline ejecutar→exportar→enviar; los jobs corren con los permisos del usuario que programó |
| `auditoriaService` | Bitácora `rep.AuditoriaEvento` (nunca interrumpe la operación) |
| `versionService` | Snapshots `rep.ReporteVersion` y comparación entre versiones |
| `perfilService` | Perfiles de reportes asignados a usuarios (sin perfil = ve todo) |
| `usuarioService` | Asignación de rol de app a usuarios de ICG, activación, historial de roles |
| `dashboardService` | Dashboards autogestionados con visibilidad PRIVADO/PERFIL/USUARIOS/PUBLICO |
| `catalogoService` / `catalogoAdminService` | Catálogo semántico (caché 5 min) y su administración; orígenes `ICG-BASE` son de solo lectura (se duplican para personalizar) |
| `brandingService` | Logo/encabezado/pie por empresa (`rep.Empresa`, `rep.EmpresaBranding`; logo ≤ 1 MB) |
| `portabilidadService` | Exporta/importa definiciones como JSON `icg-reporteria/v1` (sin datos ni credenciales); el SQL importado pasa por `sqlGuard` |
| `procedimientoService` | Lista SPs/vistas de la BD de empresa, lee definición y aplica `ALTER` |
| `actualizacionService` | Consulta GitHub Releases de `GITHUB_REPO`, staging, `npm ci`, build, backup (3 últimos) y copia; reinicio vía NSSM |
| `crypto` | AES-256-GCM con `APP_CRYPTO_KEY` para secretos guardados en BD |

## 6. Endpoints (todos bajo `/api`)

Leyenda de guardas: **auth** = sesión; **editor** = `PuedeCrear` o `PuedeEditar`; **programar** = `PuedeProgramar`; **admin** = `PuedeAdministrar`; **autogestión** = `PuedeCrearDashboards`; **supervisor** = `CodUsuarioICG` en `CATALOGO_ADMIN_CODUSUARIOS`.

### Sesión (server.js)
| Método | Ruta | Guarda | Descripción |
|---|---|---|---|
| POST | `/login` | pública (rate limit) | Login solo con contraseña; devuelve usuario, rol, permisos y empresas |
| POST | `/logout` | — | Cierra sesión y audita |
| GET | `/me` | auth | Usuario de la sesión y empresa activa |
| POST | `/sesion/empresa` | auth | Fija la empresa de gestión activa |
| GET | `/empresas?area=GESTION\|CONTABLE` | auth | Empresas permitidas (sin servidor/BD) |
| GET | `/health` | pública | Versión y estado de migraciones |

### Carpetas `/carpetas`
GET `/` (auth) árbol · POST `/` (editor) crear · PUT `/:id` (editor) renombrar/mover · DELETE `/:id` (editor) borrar.

### Reportes `/reportes`
| Método | Ruta | Guarda | Descripción |
|---|---|---|---|
| GET | `/tablas-icg/catalogo` | auth | Catálogo estático de tablas ICG para el asistente |
| GET | `/tablas-icg/columnas` | auth | Columnas de una tabla ICG en la BD de la empresa |
| GET | `/` | auth | Lista (filtrable por `carpetaId`, respeta perfiles) |
| GET | `/:id` | auth | Definición completa |
| POST | `/` | editor | Crear |
| PUT | `/:id` | editor | Modificar (versiona) |
| DELETE | `/:id` | editor | Baja lógica |
| POST | `/:id/duplicar` | editor | Duplicar |
| PUT | `/:id/vista` | editor | Guardar vista de DataGrid |
| GET | `/:id/versiones` · `/versiones/:versionId` · `/versiones/:a/comparar/:b` | auth | Historial y diff de versiones |
| POST | `/:id/parametros/:paramId/opciones` | auth | Opciones de un parámetro `LISTA_SQL` |
| POST | `/:id/ejecutar` | auth | Ejecuta con parámetros |
| POST | `/:id/exportar` | auth | Ejecuta y descarga en el formato pedido |
| POST | `/:id/enviar` | auth | Ejecuta y envía por correo |
| GET | `/:id/definicion` | editor | Exporta definición portable (JSON) |
| POST | `/columnas/descubrir` | editor | Descubre columnas del SQL |
| POST | `/definicion/analizar` | editor | Analiza un JSON antes de importar |
| POST | `/importar` | editor | Importa definición |

### Programaciones `/programaciones`
GET `/` (auth) · POST `/` (programar) · PUT `/:id/activo` (programar) · DELETE `/:id` (programar) · POST `/:id/ejecutar-ahora` (programar) · POST `/validar-cron` (auth) · GET `/historial` (auth).

### Auditoría `/auditoria` (programar)
GET `/eventos` · GET `/tipos` · GET `/estadisticas` · GET `/reporte/:id/ejecuciones`.

### Procedimientos `/procedimientos` (admin, todo el router)
GET `/empresa/sps` · GET `/empresa/vistas` · GET `/empresa/definicion` · PUT `/empresa/alterar` (aplica `ALTER` en la BD de la empresa activa).

### Branding `/branding`
GET `/` (auth) · GET `/empresa` (auth) · PUT `/empresa` (admin) · DELETE `/empresa/logo` (admin).

### Usuarios `/usuarios`
GET `/` (admin) · GET `/roles` (auth) · PUT `/:cod/rol` (admin) · PUT `/:cod/activo` (admin) · DELETE `/:cod` (admin) · GET `/historial` (admin).

### Perfiles `/perfiles`
GET `/` (auth) · GET/PUT/DELETE `/:id` (admin) · POST `/` (admin) · PUT `/:id/reportes` (admin) · GET/PUT `/usuario/:cod` (admin).

### Dashboards `/dashboards`
GET `/catalogo` · POST `/consultar` · POST `/valores` · GET `/` · GET `/:id` (auth) · POST `/` · PUT `/:id` · DELETE `/:id` · PUT `/:id/compartir` (autogestión).

### Catálogo `/catalogo` (supervisor)
GET `/origenes` · GET `/origenes/:id` · POST `/origenes/probar` · POST `/origenes` · PUT `/origenes/:id` · POST `/origenes/:id/duplicar` · DELETE `/origenes/:id` · POST `/relaciones` · DELETE `/relaciones/:id`.

### Correo `/correo`
GET `/` (auth) · POST `/` (editor) · PUT `/:id` (editor) — configuraciones SMTP.

### Actualización `/actualizacion`
GET `/check` (auth) · POST `/aplicar` (admin) · GET `/estado` (admin).

Cualquier otra ruta `/api/*` → 404 JSON. El resto de rutas sirve `frontend-vue/dist/index.html` (SPA).

### Rutas del frontend (vue-router)
`/login`, `/empresas` (selector de empresa), y bajo layout: `/reportes`, `/dashboards`, `/programaciones`, `/auditoria` (PuedeProgramar), `/procedimientos`, `/branding`, `/portabilidad`, `/usuarios`, `/perfiles`, `/actualizacion` (PuedeAdministrar).

## 7. Base de datos

### ICG_Reporteria_Config (propia, esquema `rep`)
Scripts en `db/` aplicados en orden; desde el 13 se aplican solos al arrancar y quedan en `rep.Migracion` (01–12 se marcan como *baseline* en instalaciones previas).

| Script | Contenido |
|---|---|
| `01_schema.sql` | `CREATE DATABASE`, esquema `rep`, tablas base: `AppRol`, `UsuarioApp`, `ServidorCredencial`, `Empresa`, `EmpresaBranding`, `Carpeta`, `Reporte`, `ReporteConsulta` (roles FLAT/CABECERA/DETALLE/BASE), `ReporteParametro`, `ReporteParametroOpcion`, `ReporteColumna`, `UsuarioPreferencia`, `DashboardConfig`, `ConfiguracionCorreo`, `Programacion`, `JobCola`, `EnvioCorreoHistorial`, `EjecucionLog`, `PortabilidadLog`, `ConfiguracionApp`, `dbo.sessions` |
| `02_auditoria.sql` | `AuditoriaEvento`, `ReporteVersion`, vistas `vw_EstadisticasReporte`, `vw_EstadisticasUsuario`, `vw_ActividadDiaria` |
| `03_procedimientos.sql` | `ProcedimientoPermitido` (lista blanca original de SPs; desde 0.8.1 los reportes pueden ejecutar cualquier SP de usuario y la tabla queda como histórico) |
| `04_roles.sql` | Permiso `PuedeAdministrar`, rol Administrador y `UsuarioRolHistorial` |
| `05_ejecucion_usuario.sql` | Código de usuario ICG en `EjecucionLog`; recrea vistas de estadísticas |
| `06_perfiles.sql` | `Perfil`, `PerfilReporte`, `UsuarioPerfil`, `vw_ReportesPorUsuario` |
| `07_dashboards.sql` | `AppRol.PuedeCrearDashboards`, `CatalogoOrigen`, `CatalogoCampo`, `CatalogoRelacion`, `Dashboard`, `DashboardCompartido`, `CatalogoVersion` |
| `08_catalogo_icg.sql` | Contenido del catálogo, paquete `ICG-BASE` v1 (orígenes VENTASDETALLE, STOCKS, ARTICULOS…) |
| `09_catalogo_icg_v2.sql` | v2: importes convertidos a moneda principal con `FACTORMONEDA` |
| `10_catalogo_propiedad.sql` | Columna `Paquete` (base vs. propio del cliente), `vw_UsoOrigen` |
| `11_catalogo_fechas.sql` | v3: campos de calendario y origen `CALENDARIO` generado al vuelo |
| `12_pdf.sql` | Orientación y tamaño de hoja PDF por reporte |
| `13_vista_prefs.sql` | `rep.Reporte.VistaJson` (vista de DataGrid compartida) |

Los scripts de catálogo usan `MERGE` filtrado por `Paquete = 'ICG-BASE'`; por eso cada archivo corre una sola vez (re-ejecutarlo revertiría ediciones hechas desde la app).

`install/ICG_Reporteria_Config_FULL.sql` es un script consolidado para instalación en un paso (puede quedar desfasado respecto a `db/`).

### GENERAL de ICG (solo lectura)
`dbo.USUARIOS` (CODUSUARIO, USUARIO, NEWPASS, EMAIL, BLOQUEADO, DESCATALOGADO), `dbo.EMPRESAS` (CODEMPRESA, TITULO, PATHBD), `dbo.EMPRESASUSUARIO`, `dbo.EMPRESASCONTABLES`, `dbo.EMPRESASCONTAUSUARIO`.

### BD de empresa ICG
Se consulta con el SQL de los reportes y los orígenes del catálogo (VENTASDETALLE, STOCKS, ARTICULOS, etc.). Credencial por servidor desde `rep.ServidorCredencial` (password cifrado) o, si no hay, la del `.env`. Se recomienda un login `db_datareader` (ver `install/windows-service.md`).

## 8. Integraciones externas

- **SQL Server de ICG** (GENERAL + BDs de empresa).
- **SMTP** (configurable desde la app, varias configuraciones, una predeterminada).
- **GitHub Releases** del repo `GITHUB_REPO` para el actualizador (HTTPS, sin token: repo público o accesible).
- **npm registry** durante la actualización (`npm ci`) y descarga de Chromium (`npx puppeteer browsers install chrome`).

## 9. Jobs / cron

Proceso `npm run worker` (`backend/src/worker.js`). Pueden correr varios workers (cada uno con su `WORKER_ID`).

| Reloj | Acción |
|---|---|
| `* * * * *` | `scheduler.encolarVencidas`: crea jobs para `rep.Programacion` con `ProximaEjecucion <= ahora` y recalcula la siguiente. Una programación nueva no se dispara de inmediato |
| cada 5 s | `drenarCola`: `tomarSiguiente` (UPDLOCK+READPAST) → `jobRunner.ejecutar` → `marcarOk` / `marcarError` (reintentos hasta `MaxIntentos`) |
| `*/10 * * * *` | `recuperarZombis(30)`: devuelve a la cola jobs colgados > 30 min |
| cada 60 s (si `ACTUALIZACION_REINICIAR=1`) | Si cambió la versión en disco y no hay jobs en curso, sale para que NSSM lo relance |

Los parámetros de las programaciones admiten palabras clave de período (hoy, ayer, semana pasada, mes actual…) resueltas por `cronUtil.resolverPeriodosFecha`.

## 10. Variables de configuración (`backend/.env`)

| Variable | Uso |
|---|---|
| `DB_SERVER` | Servidor SQL de la BD de config y GENERAL; default de pools de datos |
| `DB_USER` / `DB_PASSWORD` | Credencial SQL para config, GENERAL y datos por defecto |
| `CONFIG_DB_NAME` | Nombre de la BD de configuración (default `ICG_Reporteria_Config`) |
| `GENERAL_DB_NAME` | Nombre de la BD GENERAL de ICG |
| `APP_CRYPTO_KEY` | Llave AES-256 (64 hex) para cifrar passwords guardados en BD. Si se pierde, no se pueden descifrar |
| `PORT` | Puerto HTTP (default 3010) |
| `SESSION_SECRET` | Secreto de cookies de sesión; si falta, se genera uno aleatorio y las sesiones se pierden al reiniciar |
| `CORS_ORIGIN` | Orígenes permitidos (solo desarrollo con Vite), separados por coma |
| `DATA_POOL_MAX` / `DATA_POOL_IDLE_MINUTES` | Tamaño y TTL de los pools de BD de empresa |
| `QUERY_TIMEOUT_MS` | Timeout de consultas (default 120000) |
| `WORKER_ID` | Identidad del worker en la bitácora |
| `ADMIN_LOGINS` | Logins ICG (separados por `;`) que siempre son administradores |
| `CATALOGO_ADMIN_CODUSUARIOS` | CODUSUARIO ICG (separados por `;`) que administran el catálogo semántico |
| `GITHUB_REPO` | `owner/repo` para el actualizador; vacío lo deshabilita |
| `ACTUALIZACION_REINICIAR` | `1` = tras actualizar, API y worker terminan y NSSM los relanza (lo define `instalar-servicios.ps1`) |
| `PUPPETEER_CACHE_DIR` | Carpeta de Chromium (por defecto `backend/.cache/puppeteer`) |

## 11. Instalación, ejecución y despliegue

### Desarrollo
```bash
cd backend && npm install && npm run dev        # API en :3010 (node --watch)
cd frontend-vue && npm install && npm run dev   # Vite en :5173, proxy /api → :3010
cd backend && npm run worker                     # solo si se prueban programaciones
cd backend && npm test                           # pruebas unitarias (no requieren BD)
```
Las pruebas `test/*.manual.js` requieren una BD real y se ejecutan a mano (`node test/e2e.manual.js`).

### Base de datos
```powershell
cd db
.\instalar.ps1 -Servidor MISERVIDOR -Usuario sa -Clave "..."   # usa sqlcmd -f 65001 (UTF-8)
```
No ejecutar los `.sql` con `sqlcmd -i` sin `-f 65001`: los acentos se corrompen.

### Producción (Windows + NSSM)
```powershell
cd install
.\instalar-servicios.ps1            # npm ci, Chromium, build de frontend-vue, servicios
```
Crea `ICG_Reporteria_API` e `ICG_Reporteria_Worker` (arranque automático, logs rotados en `logs/`). Todo queda en `http://SERVIDOR:3010`. Guía completa: `install/windows-service.md`. HTTPS opcional con IIS+ARR o nginx como proxy inverso.

### Publicar una versión
1. Subir `version` en `backend/package.json` y `frontend-vue/package.json` y añadir entrada en `frontend-vue/src/changelog.js`.
2. Script SQL nuevo → `db/NN_nombre.sql` con el número siguiente, **idempotente**.
3. Tag `vX.Y.Z` y release en GitHub. Los clientes actualizan desde *Actualización* en la app.

## 12. Problemas conocidos y deuda técnica

- **Frontend Vue incompleto**: `DashboardsView`, `PerfilesView`, `PortabilidadView` y `ProgramacionesView` son stubs ("Módulo en construcción") aunque el backend y el frontend React legado sí implementan esos módulos.
- **Dos frontends**: `frontend/` (React) sigue versionado y `.claude/launch.json` lo arranca en el mismo puerto 5173 que `frontend-vue`. Definir si se elimina.
- **Login solo con contraseña**: cualquier contraseña válida de cualquier usuario abre sesión; el rate limit es por IP. El mensaje "contraseña duplicada" revela que la clave existe. Las contraseñas ICG son reversibles (cifrado aditivo con clave fija), así que quien lee `GENERAL.USUARIOS` las obtiene en claro.
- **sqlGuard es por lista negra** sobre texto normalizado (segundo muro). La protección real debe ser un login SQL de solo lectura en los pools de datos; si `rep.ServidorCredencial` está vacío, se usa `DB_USER` del `.env` (en desarrollo, `sa`).
- **EXEC de SP de usuario permitido**: lo que haga el SP depende de los permisos del login de datos.
- **Procedimientos** aplica `ALTER` sobre objetos del ERP: requiere un login con permisos de escritura, en contradicción con la recomendación de solo lectura.
- Cookie de sesión sin `secure` (la app corre en HTTP salvo proxy); conexiones SQL con `encrypt: false`.
- Cachés por proceso (usuarios 2 min, catálogo 5 min, credenciales hasta `clearCredCache`): cambios en otro proceso tardan en verse.
- `install/ICG_Reporteria_Config_FULL.sql` duplica los scripts de `db/` y puede desfasarse.
- PDF limitado a 500 filas; depende de Chromium en `backend/.cache/puppeteer`.
- `pdfmake` debe quedarse en 0.2.x.
- `backend/test-conn.js` y el zip de release en la raíz están ignorados por git pero presentes en disco.
