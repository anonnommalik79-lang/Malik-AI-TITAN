$ErrorActionPreference = "Stop"
$root = Get-Location

$globals = Join-Path $root "app\templates\sovereign-hub-ui\app\globals.css"
$css = Join-Path $root "MALIK_FINAL_MOBILE_POLISH.css"
$index = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\index.ts"

if (!(Test-Path $globals)) {
  throw "globals.css not found: $globals"
}

$globalsText = Get-Content -Raw -Path $globals
$cssText = Get-Content -Raw -Path $css

if ($globalsText -notmatch "MALIK FINAL QA POLISH") {
  Add-Content -Path $globals -Value "`r`n$cssText"
  Write-Host "Final mobile polish CSS appended to globals.css"
} else {
  Write-Host "Final mobile polish CSS already exists"
}

if (Test-Path $index) {
  $indexText = Get-Content -Raw -Path $index
  if ($indexText -notmatch 'persona') {
    Add-Content -Path $index -Value "`r`nexport * from `"./persona`"`r`n"
    Write-Host "persona export added"
  } else {
    Write-Host "persona export already exists"
  }
}

Write-Host "Final QA polish applied."
