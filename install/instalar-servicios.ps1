# =============================================================================
#  Instala ICG Reportería como servicios de Windows (NSSM).
#
#  - Instala dependencias y compila el frontend.
#  - Registra (o actualiza) ICG_Reporteria_API y ICG_Reporteria_Worker con
#    arranque automático, reinicio si el proceso termina y logs rotados.
#  - ACTUALIZACION_REINICIAR=1: el actualizador integrado puede reiniciarlos solo.
#  - PUPPETEER_CACHE_DIR dentro del proyecto: como servicio corren con LocalSystem
#    y Chromium (PDF) no se encontraría en el perfil del usuario que instaló.
#
#  Uso (PowerShell como administrador):
#     .\instalar-servicios.ps1
#     .\instalar-servicios.ps1 -Nssm D:\tools\nssm.exe
# =============================================================================
param(
  [string]$Nssm = 'C:\nssm\nssm.exe'
)

$ErrorActionPreference = 'Stop'
$raiz     = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backend  = Join-Path $raiz 'backend'
$frontend = Join-Path $raiz 'frontend-vue'
$logs     = Join-Path $raiz 'logs'
$cache    = Join-Path $backend '.cache\puppeteer'

if (-not (Test-Path $Nssm)) { throw "No se encontró NSSM en $Nssm (descargar de https://nssm.cc/download)" }
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $backend '.env'))) { throw "Falta backend\.env (copiar .env.example y completar)" }

$env:PUPPETEER_CACHE_DIR = $cache
function Invoke-Npm([string]$dir, [string[]]$npmArgs) {
  Push-Location $dir
  try { & npm @npmArgs; if ($LASTEXITCODE -ne 0) { throw "npm $($npmArgs -join ' ') falló en $dir" } }
  finally { Pop-Location }
}

Write-Host '-> Dependencias del backend' -ForegroundColor Cyan
Invoke-Npm $backend @('ci', '--omit=dev', '--no-audit', '--no-fund')
Write-Host '-> Dependencias y build del frontend' -ForegroundColor Cyan
Invoke-Npm $frontend @('ci', '--no-audit', '--no-fund')
Invoke-Npm $frontend @('run', 'build')

New-Item -ItemType Directory -Force $logs | Out-Null

$servicios = @(
  @{ Nombre = 'ICG_Reporteria_API';    Script = 'src\server.js' },
  @{ Nombre = 'ICG_Reporteria_Worker'; Script = 'src\worker.js' }
)
foreach ($s in $servicios) {
  $n = $s.Nombre
  Write-Host "-> Servicio $n" -ForegroundColor Cyan
  if (Get-Service $n -ErrorAction SilentlyContinue) {
    & $Nssm stop $n | Out-Null
    & $Nssm set $n Application $node | Out-Null
    & $Nssm set $n AppParameters "--max-old-space-size=512 $($s.Script)" | Out-Null
  } else {
    & $Nssm install $n $node "--max-old-space-size=512 $($s.Script)" | Out-Null
  }
  & $Nssm set $n AppDirectory $backend | Out-Null
  & $Nssm set $n AppEnvironmentExtra "ACTUALIZACION_REINICIAR=1" "PUPPETEER_CACHE_DIR=$cache" | Out-Null
  & $Nssm set $n Start SERVICE_AUTO_START | Out-Null
  & $Nssm set $n AppExit Default Restart | Out-Null
  & $Nssm set $n AppRestartDelay 2000 | Out-Null
  & $Nssm set $n AppStdout (Join-Path $logs "$n.log") | Out-Null
  & $Nssm set $n AppStderr (Join-Path $logs "$n.log") | Out-Null
  & $Nssm set $n AppRotateFiles 1 | Out-Null
  & $Nssm set $n AppRotateOnline 1 | Out-Null
  & $Nssm set $n AppRotateBytes 10485760 | Out-Null
  & $Nssm start $n | Out-Null
}

$puerto = (Select-String -Path (Join-Path $backend '.env') -Pattern '^\s*PORT\s*=\s*(\d+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
if (-not $puerto) { $puerto = 3010 }
Write-Host "Listo. Abrir http://$($env:COMPUTERNAME):$puerto  (logs en $logs)" -ForegroundColor Green
