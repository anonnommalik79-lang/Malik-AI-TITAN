param(
  [string]$BaseUrl = "http://localhost:5000",
  [string]$AdminEmail = "amangeldymalik38@gmail.com"
)

$ErrorActionPreference = "Continue"

$routes = @(
  "/api/health",
  "/api/ai/status",
  "/api/ai/scale/status",
  "/api/ai/usage?userId=guest&plan=free",
  "/api/ai/admin/status?userEmail=$AdminEmail",
  "/api/ai/limits/status?userEmail=$AdminEmail&plan=free",
  "/api/ai/media/status"
)

Write-Host "MALIK QA Smoke Test -> $BaseUrl"

foreach ($route in $routes) {
  $url = "$BaseUrl$route"
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    Write-Host "OK $($res.StatusCode) $route"
  } catch {
    Write-Host "WARN $route -> $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Manual prompt checks:"
Write-Host "- Знаешь Gemini AI? -> normal answer about Gemini"
Write-Host "- Кто ты? -> short MALIK AI description only when asked"
Write-Host "- Создай простой React компонент кнопки -> one Button.tsx component"
Write-Host "- Создай landing page для Sovereign Hub -> project/full output"
Write-Host "- Исправь ошибку Maximum update depth exceeded -> debug cause + fix"
Write-Host "- Сделай аву Sovereign Hub -> image task"
Write-Host "- Сделай видео рекламу MALIK AI -> video task"
