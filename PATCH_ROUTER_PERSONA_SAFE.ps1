$ErrorActionPreference = "Stop"

$routerPath = Join-Path (Get-Location) "app\templates\sovereign-hub-ui\lib\ai\router.ts"

if (!(Test-Path $routerPath)) {
  throw "router.ts not found: $routerPath"
}

$content = Get-Content -Raw -Path $routerPath

# Add import safely.
if ($content -notmatch 'systemPromptForTask') {
  if ($content -match 'import type \{ AIProvider, AIRequest, AIResponse \} from "\./types"') {
    $content = $content -replace 'import type \{ AIProvider, AIRequest, AIResponse \} from "\./types"', "import type { AIProvider, AIRequest, AIResponse } from `"./types`"`r`nimport { systemPromptForTask } from `"./persona`""
  } elseif ($content -match 'from "\./types"') {
    $content = $content -replace '(import type .* from "\./types"\s*)', "`$1import { systemPromptForTask } from `"./persona`"`r`n"
  } else {
    $content = "import { systemPromptForTask } from `"./persona`"`r`n" + $content
  }
}

# Patch messages line safely.
$oldLine = 'messages: input.messages?.slice(-Number(process.env.CHAT_HISTORY_WINDOW || 12)),'
$newBlock = @'
messages: (() => {
      const windowed = input.messages?.slice(-Number(process.env.CHAT_HISTORY_WINDOW || 12)) || []
      const hasSystem = windowed.some((message) => message.role === "system")
      return hasSystem ? windowed : [{ role: "system" as const, content: systemPromptForTask(task) }, ...windowed]
    })(),
'@

if ($content.Contains($oldLine)) {
  $content = $content.Replace($oldLine, $newBlock)
  Write-Host "router.ts messages normalization patched"
} elseif ($content -match 'systemPromptForTask\(task\)') {
  Write-Host "router.ts already uses systemPromptForTask"
} else {
  Write-Host "Could not find exact messages line. No router logic changed. Build can still pass, but persona may not be injected."
}

Set-Content -Path $routerPath -Value $content -Encoding UTF8
Write-Host "Router persona patch complete."
