$ErrorActionPreference = "Stop"
$root = Get-Location

$globals = Join-Path $root "app\templates\sovereign-hub-ui\app\globals.css"
$css = Join-Path $root "MALIK_MOBILE_UI_STAGE2.css"
$index = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\index.ts"

if (!(Test-Path $globals)) {
  throw "globals.css not found: $globals"
}

$globalsText = Get-Content -Raw -Path $globals
$cssText = Get-Content -Raw -Path $css

if ($globalsText -notmatch "MALIK MOBILE UI STAGE 2") {
  Add-Content -Path $globals -Value "`r`n$cssText"
  Write-Host "Stage 2 mobile UI CSS appended to globals.css"
} else {
  Write-Host "Stage 2 mobile UI CSS already exists"
}

if (Test-Path $index) {
  $indexText = Get-Content -Raw -Path $index
  if ($indexText -notmatch 'persona') {
    Add-Content -Path $index -Value "`r`nexport * from `"./persona`"`r`n"
    Write-Host "persona export added to lib/ai/index.ts"
  } else {
    Write-Host "persona export already exists"
  }
}

powershell -NoProfile -ExecutionPolicy Bypass -File ".\PATCH_ROUTER_PERSONA.ps1"

Write-Host "MALIK mobile UI/persona stage 2 applied."
