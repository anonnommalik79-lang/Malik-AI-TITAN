$ErrorActionPreference = "Stop"
$root = Get-Location
$runPath = Join-Path $root "run.py"
$indexPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\index.ts"
$usageIndexPath = Join-Path $root "app\templates\sovereign-hub-ui\components\sovereign\usage-limits\index.ts"

if (!(Test-Path $runPath)) {
  throw "run.py not found at $runPath"
}

$content = Get-Content -Raw -Path $runPath
$block = @'

# ---------------- Optional Stage 4 admin/dev bypass routes ----------------
try:
    from app.ai.admin_bypass import admin_bypass_bp
    app.register_blueprint(admin_bypass_bp)
    print("✅ [MALIK] Admin/dev bypass routes connected: /api/ai/admin/status /api/ai/limits/status")
except Exception as e:
    print("⚠️ [MALIK] Admin/dev bypass routes skipped:", e)
'@

if ($content -notmatch "admin/dev bypass routes") {
  if ($content -match "DATABASE_URL = os.environ.get") {
    $content = $content -replace 'DATABASE_URL = os\.environ\.get\("DATABASE_URL", ""\)', "$block`r`nDATABASE_URL = os.environ.get(`"DATABASE_URL`", `"`")"
  } else {
    $content = $content + "`r`n" + $block
  }
  Set-Content -Path $runPath -Value $content -Encoding UTF8
  Write-Host "Admin/dev bypass blueprint connected in run.py"
} else {
  Write-Host "Admin/dev bypass block already exists in run.py"
}

if (Test-Path $indexPath) {
  $index = Get-Content -Raw -Path $indexPath
  if ($index -notmatch 'admin-bypass') {
    Add-Content -Path $indexPath -Value "`r`nexport * from `"./admin-bypass`"`r`n"
    Write-Host "admin-bypass export added"
  } else {
    Write-Host "admin-bypass export already exists"
  }
}

if (Test-Path $usageIndexPath) {
  $usageIndex = Get-Content -Raw -Path $usageIndexPath
  if ($usageIndex -notmatch 'UsageBypassBadge') {
    Add-Content -Path $usageIndexPath -Value "`r`nexport * from `"./UsageBypassBadge`"`r`n"
    Write-Host "UsageBypassBadge export added"
  } else {
    Write-Host "UsageBypassBadge export already exists"
  }
}

Write-Host "Stage 4 admin/dev bypass applied."
