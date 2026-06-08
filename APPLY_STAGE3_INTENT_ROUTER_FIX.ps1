$ErrorActionPreference = "Stop"
$root = Get-Location
$indexPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\index.ts"
$routerPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\router.ts"

if (Test-Path $indexPath) {
  $index = Get-Content -Raw -Path $indexPath
  if ($index -notmatch 'task-prompts') {
    Add-Content -Path $indexPath -Value "`r`nexport * from `"./task-prompts`"`r`n"
    Write-Host "task-prompts export added"
  }
}

if (Test-Path $routerPath) {
  $content = Get-Content -Raw -Path $routerPath

  if ($content -notmatch 'taskSystemPrompt') {
    if ($content -match 'import \{ systemPromptForTask \} from "\./persona"') {
      $content = $content -replace 'import \{ systemPromptForTask \} from "\./persona"', 'import { systemPromptForTask } from "./persona"' + "`r`n" + 'import { taskSystemPrompt } from "./task-prompts"'
    } else {
      $content = 'import { taskSystemPrompt } from "./task-prompts"' + "`r`n" + $content
    }
  }

  # Replace systemPromptForTask(task) with task-aware prompt including the original input prompt.
  $content = $content.Replace('systemPromptForTask(task)', 'taskSystemPrompt(task, input.prompt)')

  Set-Content -Path $routerPath -Value $content -Encoding UTF8
  Write-Host "router.ts task prompt behavior patched"
} else {
  Write-Host "router.ts not found, skipped"
}

Write-Host "Stage 3 intent router fix applied."
