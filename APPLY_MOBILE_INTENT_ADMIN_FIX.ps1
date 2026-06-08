$ErrorActionPreference = "Stop"
$root = Get-Location

$globals = Join-Path $root "app\templates\sovereign-hub-ui\app\globals.css"
$mobileCss = Join-Path $root "MALIK_MOBILE_SAFETY.css"
$indexPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\index.ts"

if (!(Test-Path $globals)) {
  throw "globals.css not found: $globals"
}

$marker = "/* MALIK MOBILE SAFETY FIX"
$globalsContent = Get-Content -Raw -Path $globals
$cssContent = Get-Content -Raw -Path $mobileCss

if ($globalsContent -notmatch [regex]::Escape($marker)) {
  Add-Content -Path $globals -Value "`r`n$cssContent"
  Write-Host "Mobile safety CSS appended to globals.css"
} else {
  Write-Host "Mobile safety CSS already exists in globals.css"
}

if (Test-Path $indexPath) {
  $indexContent = Get-Content -Raw -Path $indexPath
  if ($indexContent -notmatch 'admin-bypass') {
    Add-Content -Path $indexPath -Value "`r`nexport * from `"./admin-bypass`"`r`n"
    Write-Host "admin-bypass export added to lib/ai/index.ts"
  } else {
    Write-Host "admin-bypass export already exists"
  }
}

Write-Host "MALIK mobile/intent/admin fix applied."
