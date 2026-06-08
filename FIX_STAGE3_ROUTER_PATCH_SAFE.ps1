$ErrorActionPreference = "Stop"

$root = Get-Location
$routerPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\router.ts"
$indexPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\ai\index.ts"

if (!(Test-Path $routerPath)) {
  throw "router.ts not found: $routerPath"
}

# Ensure task-prompts export exists.
if (Test-Path $indexPath) {
  $index = Get-Content -Raw -Path $indexPath
  if ($index -notmatch 'task-prompts') {
    Add-Content -Path $indexPath -Value "`r`nexport * from `"./task-prompts`"`r`n"
    Write-Host "task-prompts export added"
  } else {
    Write-Host "task-prompts export already exists"
  }
}

$content = Get-Content -Raw -Path $routerPath

# Add taskSystemPrompt import safely without PowerShell array -replace bug.
if ($content -notmatch 'taskSystemPrompt') {
  $lines = $content -split "`r?`n"
  $inserted = $false
  $newLines = New-Object System.Collections.Generic.List[string]

  foreach ($line in $lines) {
    $newLines.Add($line)
    if (!$inserted -and $line -match 'from "\./persona"') {
      $newLines.Add('import { taskSystemPrompt } from "./task-prompts"')
      $inserted = $true
    }
  }

  if (!$inserted) {
    $newLines.Insert(0, 'import { taskSystemPrompt } from "./task-prompts"')
  }

  $content = ($newLines -join "`r`n")
  Write-Host "taskSystemPrompt import added"
} else {
  Write-Host "taskSystemPrompt import already exists"
}

# Replace generic persona call with task-aware prompt.
if ($content -match 'systemPromptForTask\(task\)') {
  $content = $content.Replace('systemPromptForTask(task)', 'taskSystemPrompt(task, input.prompt)')
  Write-Host "systemPromptForTask(task) replaced with taskSystemPrompt(task, input.prompt)"
} elseif ($content -match 'taskSystemPrompt\(task, input\.prompt\)') {
  Write-Host "router already uses taskSystemPrompt(task, input.prompt)"
} else {
  Write-Host "No system prompt call found. Router import added; behavior may depend on current router structure."
}

Set-Content -Path $routerPath -Value $content -Encoding UTF8
Write-Host "Stage 3 safe router patch complete."
