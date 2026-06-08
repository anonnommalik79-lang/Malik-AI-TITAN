$ErrorActionPreference = "Stop"
$runPath = Join-Path (Get-Location) "run.py"

if (!(Test-Path $runPath)) {
  throw "run.py not found at $runPath"
}

$content = Get-Content -Raw -Path $runPath

$block = @'

# ---------------- Optional Stage 5 scale routes ----------------
try:
    from app.ai.scale import scale_bp
    app.register_blueprint(scale_bp)
    print("✅ [MALIK] Stage 5 scale routes connected: /api/ai/scale/status /api/ai/usage")
except Exception as e:
    print("⚠️ [MALIK] Stage 5 scale routes skipped:", e)
'@

if ($content -notmatch "Stage 5 scale routes") {
  if ($content -match "DATABASE_URL = os.environ.get") {
    $content = $content -replace 'DATABASE_URL = os\.environ\.get\("DATABASE_URL", ""\)', "$block`r`nDATABASE_URL = os.environ.get(`"DATABASE_URL`", `"`")"
  } else {
    $content = $content + "`r`n" + $block
  }
  Set-Content -Path $runPath -Value $content -Encoding UTF8
  Write-Host "Stage 5 scale blueprint connected in run.py"
} else {
  Write-Host "Stage 5 scale block already exists in run.py"
}
