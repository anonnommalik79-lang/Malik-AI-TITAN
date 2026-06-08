$ErrorActionPreference = "Stop"
$runPath = Join-Path (Get-Location) "run.py"

if (!(Test-Path $runPath)) {
  throw "run.py not found at $runPath"
}

$content = Get-Content -Raw -Path $runPath

$block = @'

# ---------------- Optional Stage 4 project builder routes ----------------
try:
    from app.ai.project_builder import project_builder_bp
    app.register_blueprint(project_builder_bp)
    print("✅ [MALIK] Stage 4 project builder routes connected: /api/ai/project /api/ai/project/<id> /api/ai/projects")
except Exception as e:
    print("⚠️ [MALIK] Stage 4 project builder routes skipped:", e)
'@

if ($content -notmatch "Stage 4 project builder routes") {
  if ($content -match "DATABASE_URL = os.environ.get") {
    $content = $content -replace 'DATABASE_URL = os\.environ\.get\("DATABASE_URL", ""\)', "$block`r`nDATABASE_URL = os.environ.get(`"DATABASE_URL`", `"`")"
  } else {
    $content = $content + "`r`n" + $block
  }

  Set-Content -Path $runPath -Value $content -Encoding UTF8
  Write-Host "Stage 4 project builder blueprint connected in run.py"
} else {
  Write-Host "Stage 4 project builder block already exists in run.py"
}
