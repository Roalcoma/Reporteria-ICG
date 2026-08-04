# ICG Reportería Dinámica

Herramienta de reportería dinámica sobre el ERP **ICG** (SQL Server exclusivo),
con enrutamiento dinámico de bases de datos, multiempresa (gestión/contable) y
motor de consultas T-SQL parametrizadas a prueba de inyección.

> **Aislamiento estricto:** toda la configuración vive en la BD independiente
> `ICG_Reporteria_Config`. **No se crea ninguna tabla en las BD de ICG.**

## Stack (100% sin licenciamiento)
- **Backend:** Node.js + Express + `node-mssql`.
- **Frontend:** Vite + React + TanStack Table (grid). Pendientes: react-pivottable
  (dashboards), Apache ECharts (gráficos), Monaco Editor (editor T-SQL).
- **Scheduler:** cola en el propio SQL Server (`rep.JobCola`) + worker Node.
- **Despliegue:** servicio nativo de Windows vía NSSM (ver `install/`).

## Estructura
```
db/01_schema.sql              DDL completo de ICG_Reporteria_Config (esquema rep)
backend/
  src/config/                 carga de .env y opciones de conexión
  src/db/connectionManager.js pool fijo (config) + GENERAL + pools dinámicos (datos)
  src/services/
    icgPassword.js            cifrado ICG (NORMALKEY) portado de frfran-web
    crypto.js                 AES-256-GCM para secretos en la BD config
    authService.js            login + permisos de empresa contra GENERAL (solo lectura)
    schedulerService.js       cola de jobs (UPDLOCK, READPAST) para N workers
  src/engine/
    sqlTypeMapper.js          TipoDato -> tipo node-mssql (Decimal con escala)
    queryTemplateEngine.js    {PARAM} -> @parámetros ENLAZADOS (anti-inyección)
    reportExecutor.js         ejecutores SIMPLE / MASTER_DETAIL / DASHBOARD
  src/server.js               API HTTP (login, empresas; endpoints de reportes = TODO)
  src/worker.js               proceso del scheduler
  test/icgPassword.test.js    verificación del cifrado vs NEWPASS real
  src/routes/                 carpetas.routes.js · reportes.routes.js
  src/middleware/auth.js      requireAuth / requireEditor
install/windows-service.md    despliegue como servicio Windows + login solo lectura
frontend/
  src/api.js                  cliente HTTP (cookie de sesión + descarga de exports)
  src/format.js               formatos (moneda/fecha/%) y métricas de pie
  src/components/
    Login.jsx                 login contra usuarios de GENERAL
    ArbolReportes.jsx         navegador de carpetas y reportes
    ReporteViewer.jsx         selector empresa/ejercicio, ejecución, export, correo
    ParametrosForm.jsx        controles dinámicos de {PARAMETRO}
    DataGrid.jsx              TanStack Table: columnas, alias, agrupación, subtotales
    SqlEditor.jsx             Monaco (local, sin CDN) con realce de {PARAMETRO}
    ReporteEditor.jsx         pantalla del creador: SQL + tipificación de parámetros
    DashboardPanel.jsx        gráficos ECharts + tabla dinámica (react-pivottable)
    Programaciones.jsx        scheduler: programaciones + historial de envíos
    Branding.jsx              logo/encabezado por empresa + vista previa
    Procedimientos.jsx        lista blanca de SPs autorizados
    Auditoria.jsx             estadísticas de uso + bitácora
    HistorialReporte.jsx      evolución del reporte (versiones + diff)
```

## Editor de columnas
Dentro del editor de reportes, el botón **Detectar columnas** ejecuta la consulta
en modo diseño y lee los metadatos del resultado, así el creador no escribe los
nombres de campo a mano. Cada columna configura:

- **Título visible** (alias de presentación) y **orden** (subir/bajar);
- **Formato**: texto, entero, número, moneda, fecha o porcentaje, con un
  **patrón** opcional — `Bs #,##0.00` antepone el símbolo, `#,##0.000` fija los
  decimales, `dd/MM/yyyy HH:mm` añade la hora;
- **Visible / Ocultable**: si aparece por defecto y si el usuario final puede
  mostrarla u ocultarla desde el visor;
- **Agrupable** y **Total al pie** (suma, promedio, conteo, mín., máx.).

El formato inicial se **sugiere según el tipo SQL** (`money` → moneda,
`datetime` → fecha, `decimal(18,2)` → número, `decimal(18,0)` → entero). La
consulta en modo diseño pasa por la **misma guarda** que al ejecutar: no es una
puerta trasera.

> Los porcentajes **no** se multiplican por 100: en ICG se guardan ya en escala
> 0-100 (un 12,34 % se almacena como `12.34`).

## Portabilidad entre instalaciones
Pantalla **📦 Portabilidad**: exporta la definición de un reporte (consulta,
parámetros, opciones y columnas) a un `.json` para importarla en el ICG de otro
cliente. **No** viajan datos, credenciales ni identificadores internos.

Antes de importar, el archivo se **analiza sin guardar nada** y se muestra un
resumen (tipo, área, consultas, parámetros) junto con los problemas detectados:

- **ERROR** (bloquea): formato desconocido, sin consultas, SQL que no pasa la
  guarda o —el caso típico al migrar— un **procedimiento almacenado que el
  cliente de origen tenía autorizado y este no**. La solución es autorizarlo en
  🔐 SPs, no relajar la validación.
- **AVISO** (no bloquea): ya existe un reporte activo con ese nombre.

El SQL importado pasa por la misma guarda que el escrito a mano, así que un
archivo manipulado no puede introducir sentencias destructivas. Cada
exportación e importación queda auditada, y la importación crea la primera
versión del historial del reporte.

## Navegación de reportes
El panel lateral incluye **buscador** (por nombre, descripción o tipo) y
distingue los reportes de un vistazo:

| | Tipo | Color |
|---|---|---|
| 📄 | Simple | azul |
| 🗂️ | Multinivel | morado |
| 📊 | Dashboard | verde |

Con permiso de edición aparecen acciones al pasar el cursor: **crear carpeta y
subcarpeta, renombrar, eliminar**, y sobre cada reporte **duplicar (⧉)** y
**eliminar (🗑)**. Duplicar copia la definición completa —consultas, parámetros y
columnas— y deja el original intacto.

Una carpeta **no se elimina si tiene contenido activo** (responde 409 indicando
cuántos reportes y subcarpetas hay). Los reportes ya eliminados se desvinculan
solos: su borrado es lógico y conservan el historial para auditoría.

## Perfiles de reporte
Un **perfil** agrupa reportes (p. ej. «Contable», «Gerencia de tienda») y se
asigna a los usuarios. Al añadir o quitar un reporte del perfil el cambio
alcanza de inmediato a todos sus usuarios: no hay que tocarlos uno por uno.

Los perfiles definen **qué reportes ve** cada usuario; el rol define **qué puede
hacer**. Son dimensiones independientes.

Regla de visibilidad:
- usuario **sin** perfiles → ve todos los reportes (no rompe instalaciones existentes);
- usuario **con** perfiles → solo los de sus perfiles;
- **administradores** → siempre ven todo.

Se gestionan en **🗃️ Perfiles**; la asignación a cada usuario está en el botón
*Perfiles* de la pantalla 👥 Usuarios.

## Usuarios y roles
Los usuarios **no se crean aquí**: viven en `GENERAL.USUARIOS` de ICG (solo
lectura). La pantalla **👥 Usuarios** decide qué puede hacer cada uno dentro de
la reportería. Quien no tenga rol asignado entra como **Lectura**.

Roles semilla: `Lectura`, `Creador/Editor` y `Administrador`. El permiso
**`PuedeAdministrar`** es independiente de `PuedeCrear`: un Creador **no** puede
auto-promoverse ni tocar los roles de otros.

Salvaguardas (probadas):
- nadie puede cambiar, quitar ni desactivar **su propio** rol;
- no se puede degradar, desactivar ni borrar al **último administrador**.

**Arranque y recuperación** — `ADMIN_LOGINS` en el `.env` lista los logins de ICG
que siempre son administradores, aunque no estén en `rep.UsuarioApp`. Resuelve el
primer arranque y permite recuperar el acceso si la instalación se quedara sin
administradores; cambiarlo exige entrar al servidor, no a la aplicación.

Cada cambio de rol queda en `rep.UsuarioRolHistorial` (quién cambió a quién,
rol anterior y nuevo) además de la bitácora general.

## Identidad corporativa (branding)
Pantalla **🎨 Branding**: por cada empresa (gestión o contable) se guarda logo,
encabezado y pie institucional en la BD de configuración — nunca en ICG.

- El logo se sube como **data URI** dentro del JSON (sin dependencia de multipart);
  se valida el tipo (PNG/JPG/GIF/WEBP/SVG) y un máximo de **1 MB**.
- Al exportar o enviar en **HTML** se incrusta como base64 en el propio archivo,
  así el documento se ve igual sin conexión ni recursos externos.
- Solo pueden configurarse empresas a las que el usuario tiene acceso en ICG, y
  cada cambio queda auditado (`BRANDING_GUARDAR`).
- `rep.Empresa` se crea sola la primera vez que se configura una empresa: es un
  registro local para poder colgarle branding, no un duplicado de ICG.

### Notas de empaquetado
- **Monaco se sirve desde el paquete local**, no desde CDN: `@monaco-editor/react`
  usa jsDelivr por defecto y eso rompería en servidores sin salida a internet.
- `ReporteEditor` (Monaco) y `DashboardPanel` (ECharts + pivottable) se cargan con
  `React.lazy`, así la carga inicial baja de ~1,5 MB gzip a **~68 kB gzip**: quien
  solo consulta reportes no descarga el editor ni las librerías de dashboard.

## Enrutamiento (clave del diseño)
`GENERAL` guarda el destino de cada empresa en **`PATHBD` = `SERVIDOR:BASEDATOS`**
(ej. `LOCALHOST:CLARKS2025`). El sistema lo lee en vivo y crea el pool
correspondiente; **no se duplican cadenas de conexión** en la BD de config.
Solo se guarda la credencial de lectura por servidor en `rep.ServidorCredencial`.

## Seguridad

**La reportería es de SOLO LECTURA.** Si un proceso necesita borrar o modificar
datos se implementa como un procedimiento almacenado **fuera** de esta
herramienta; desde la interfaz nunca se escriben esas acciones.

Tres muros independientes:

1. **Login SQL de solo lectura** en las conexiones de datos (ver `install/`).
2. **`sqlGuard`** sobre todo SQL que escribe un Creador — se aplica al guardar
   *y* al ejecutar, e incluye el SQL de las listas dinámicas (`SqlOrigen`):
   - normaliza el texto (quita comentarios, literales y corchetes) para que
     `/**/`, `--` o `'DROP'` no sirvan de disfraz ni causen falsos positivos;
   - **una sola sentencia**: prohíbe encadenar con `;`;
   - **lista blanca de inicio**: solo `SELECT` o `WITH`;
   - **lista negra**: DELETE, UPDATE, INSERT, MERGE, TRUNCATE, DROP, CREATE,
     ALTER, GRANT/REVOKE, `sp_`/`xp_`, BACKUP, DBCC, SHUTDOWN, `SELECT INTO`…
   - **excepción controlada**: `EXEC` de un procedimiento **autorizado** (abajo).
3. **Parámetros enlazados**: los valores de `{PARAM}` nunca se concatenan;
   identificadores dinámicos por whitelist + `QUOTENAME`; multiselección con
   `STRING_SPLIT`.

Las contraseñas de conexión/SMTP se cifran con AES-256-GCM (llave en `.env`).
Todo SQL rechazado queda registrado como evento `SQL_RECHAZADO` en la auditoría.

### Reportes basados en procedimiento almacenado
Un reporte **sí** puede ejecutar un SP, pero **no existe `EXEC` libre**: solo se
admiten los registrados en `rep.ProcedimientoPermitido` (pantalla **🔐 SPs**).

Sintaxis admitida en el editor — deliberadamente restrictiva:
```sql
EXEC dbo.REP_VENTASDIARIAS @Desde = {FECHA_INI}, @Hasta = {FECHA_FIN}
```
Los valores siguen viajando **enlazados** (`@Desde = @FECHA_INI`), nunca
concatenados. Se rechazan: SP no autorizado, `sp_`/`xp_` aunque estén en la
lista, `EXEC('...')` dinámico y cualquier encadenado con `;`.

La pantalla permite **descubrir** los SP de la BD de la empresa activa (solo
lee `sys.objects`) y autorizarlos con un clic; cada alta/baja queda auditada.

> ⚠️ Un SP puede hacer internamente lo que quiera. La lista blanca evita que se
> llame cualquier cosa, pero la garantía de que no escriba proviene del **login
> SQL de solo lectura**. Autorice únicamente procedimientos de lectura revisados
> por un DBA (ojo con los que usen `EXECUTE AS`).

## Auditoría, versionado y estadísticas
- **`rep.AuditoriaEvento`** — bitácora de quién hizo qué: login (y login fallido),
  creación/modificación/borrado de reportes, **consultas**, exportaciones, envíos,
  cambios de programación y SQL rechazado. Guarda el código de usuario ICG, la
  empresa/ejercicio y la IP.
- **`rep.ReporteVersion`** — snapshot completo de la definición en cada cambio.
  Permite ver la **evolución** de un reporte y **comparar dos versiones** (diff
  del SQL, parámetros añadidos/eliminados/modificados). No tiene FK: la historia
  sobrevive al borrado del reporte.
- **Vistas** `vw_EstadisticasReporte`, `vw_EstadisticasUsuario` y
  `vw_ActividadDiaria` alimentan el panel: reportes más consultados, usuarios más
  activos, reportes más lentos, errores, actividad diaria y reportes sin uso.

## Puesta en marcha (dev)
### Instalación de la base de datos
```powershell
cd db
.\instalar.ps1                              # local, autenticación de Windows
.\instalar.ps1 -Servidor SRV -Usuario sa -Clave "..."
```
Ejecuta los scripts en orden, es **re-ejecutable** (sirve para actualizar) y
verifica la codificación al terminar.

> ⚠️ **No invoque `sqlcmd -i` a mano sin `-f 65001`.** Los `.sql` están en UTF-8,
> pero sqlcmd los lee con la codepage ANSI del sistema salvo que se le indique:
> sin ese parámetro, «Código» se almacena como «CÃ³digo» en la base de datos.

Equivalente manual (en este orden y **siempre con `-f 65001`**):
```bash
# 1) Crear la BD de config (en orden)
sqlcmd -S localhost -i db/01_schema.sql
sqlcmd -S localhost -i db/02_auditoria.sql
sqlcmd -S localhost -i db/03_procedimientos.sql
sqlcmd -S localhost -i db/04_roles.sql
sqlcmd -S localhost -i db/05_ejecucion_usuario.sql
sqlcmd -S localhost -i db/06_perfiles.sql

# 2) Backend
cd backend
npm install
cp .env.example .env   # editar valores reales
npm run dev            # API
npm run worker         # (en otra terminal) scheduler
```

## Scheduler (worker)
El worker (`npm run worker`) no depende de SQL Agent ni de Redis:
- cada minuto encola las `rep.Programacion` vencidas y recalcula su próxima
  corrida con `cron-parser`;
- drena `rep.JobCola` cada 5 s reclamando jobs con `UPDLOCK, READPAST`
  (varios workers en paralelo no toman el mismo job);
- cada 10 min recupera jobs que quedaron colgados por un worker caído;
- pipeline por job: **ejecutar → exportar → enviar → historial**.

Los envíos programados se ejecutan **con los permisos del usuario que creó la
programación**, así el scheduler nunca elude la validación de empresas de ICG.

## Pruebas
```bash
cd backend && npm test
```
Cubren el cifrado ICG (round-trip contra un `NEWPASS` real), el motor
anti-inyección (payloads de inyección, whitelist de identificadores,
multiselección, guard SELECT-only), el cálculo de expresiones cron, la
exportación con branding, las salvaguardas de roles, el análisis de
portabilidad y la sugerencia de formatos.

### Prueba end-to-end contra un servidor real
No forma parte de `npm test`: necesita la BD de configuración creada, el `.env`
configurado y el API corriendo.
```bash
npm start
node test/e2e.manual.js            # o: node test/e2e.manual.js OTRO_USUARIO
```
Recorre el flujo completo — login por contraseña, selección de empresa, rechazo
de SQL peligroso, creación y ejecución de un reporte, detección de columnas,
intento de inyección por parámetro, exportación, portabilidad, auditoría,
versiones y estadísticas — y borra el reporte de prueba al terminar. Nunca
imprime contraseñas.

```bash
node test/scheduler.manual.js      # solo necesita la BD, no el API
```
Prueba el scheduler contra la BD real: lanza **4 workers en paralelo** sobre una
cola de 12 trabajos y comprueba que ninguno se procese dos veces (claim atómico
con `UPDLOCK, READPAST`), los reintentos, el paso a `ERROR` al agotarlos, la
recuperación de trabajos huérfanos de un worker caído y que un trabajo en curso
no se toque.

### Instalación de los logins SQL
El despliegue usa **dos logins separados**, por principio de mínimo privilegio:
- `readonly_rep` — `db_datareader` en `GENERAL` y en las BD de empresas. Es el
  muro real contra escrituras: aunque un reporte lograra colar un `DELETE`, el
  motor lo rechazaría.
- `icg_reporteria_app` — lectura/escritura **solo** en `ICG_Reporteria_Config`.
  No tiene ningún acceso a las bases de ICG.

> Al escribir el `.env`, evite contraseñas con `#`, comillas o `$`: `dotenv` las
> interpreta y el login falla de forma silenciosa.

## Pendiente (siguiente iteración)
- Endpoints y UI de branding (subida de logo por empresa).
- Administración de usuarios/roles de la app (`rep.UsuarioApp`).
- UI de portabilidad (exportar/importar definición de reportes) y editor visual
  de columnas (alias/formatos) desde el editor de reportes.
