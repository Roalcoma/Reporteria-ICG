# =============================================================================
#  Instalación / actualización de ICG_Reporteria_Config
#
#  Ejecuta todos los scripts en orden y con la codificación correcta.
#
#  IMPORTANTE — POR QUÉ ESTE SCRIPT EXISTE:
#  Los .sql están en UTF-8, pero `sqlcmd -i` los lee con la codepage ANSI del
#  sistema salvo que se indique lo contrario. Sin `-f 65001`, los acentos se
#  guardan mal en la base: "Código" acaba almacenado como "CÃ³digo".
#  Use SIEMPRE este script (o añada -f 65001) en lugar de invocar sqlcmd a mano.
#
#  Uso:
#     .\instalar.ps1                          # servidor local, autenticación de Windows
#     .\instalar.ps1 -Servidor MISERVIDOR
#     .\instalar.ps1 -Servidor SRV -Usuario sa -Clave "..."
# =============================================================================
param(
  [string]$Servidor = 'localhost',
  [string]$Usuario,
  [string]$Clave
)

$ErrorActionPreference = 'Stop'
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path

# Orden obligatorio (numérico): cada script asume el anterior. Se toman todos los
# NN_*.sql para no olvidar los nuevos. Después, el backend aplica solo los que
# falten al arrancar (rep.Migracion).
$scripts = Get-ChildItem $carpeta -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d+_' } |
  Sort-Object { [int]($_.Name -split '_')[0] } |
  ForEach-Object { $_.Name }

# Conexión + autenticación. Se arma la lista completa de argumentos: mezclar
# splatting con parámetros sueltos hace que sqlcmd reciba un argumento vacío.
function Get-ArgsBase {
  $a = @('-S', $Servidor)
  if ($Usuario) { $a += @('-U', $Usuario, '-P', $Clave) } else { $a += '-E' }
  # -f 65001 = leer los .sql como UTF-8. Sin esto los acentos se corrompen.
  $a += @('-f', '65001')
  return $a
}

Write-Host "Instalando en $Servidor" -ForegroundColor Cyan
foreach ($s in $scripts) {
  $ruta = Join-Path $carpeta $s
  if (-not (Test-Path $ruta)) { Write-Host "  ! falta $s" -ForegroundColor Yellow; continue }
  Write-Host "  -> $s"
  $argumentos = (Get-ArgsBase) + @('-i', $ruta, '-b')
  $salida = & sqlcmd $argumentos 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ($salida | Out-String) -ForegroundColor Red
    throw "Fallo el script $s"
  }
  $salida | Where-Object { $_ -match 'cread|aplicad|atalogo|correctamente' } |
    ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }
}

# Comprobación final: ningún texto debe haber quedado mal codificado.
$consulta = "SET NOCOUNT ON; SELECT (SELECT COUNT(*) FROM rep.CatalogoCampo WHERE Etiqueta LIKE '%Ã%' OR Descripcion LIKE '%Ã%') + (SELECT COUNT(*) FROM rep.CatalogoOrigen WHERE Nombre LIKE '%Ã%' OR Descripcion LIKE '%Ã%');"
$chk = & sqlcmd ((Get-ArgsBase) + @('-d', 'ICG_Reporteria_Config', '-h', '-1', '-W', '-Q', $consulta))
$malos = ($chk | Select-Object -First 1).Trim()
if ($malos -ne '0') {
  Write-Host "AVISO: $malos textos con codificacion incorrecta." -ForegroundColor Yellow
} else {
  Write-Host "Instalacion completada. Codificacion verificada." -ForegroundColor Green
}
