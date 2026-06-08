$ErrorActionPreference = "Stop"
$routerPath = Join-Path (Get-Location) "app\templates\sovereign-hub-ui\lib\ai\router.ts"

if (!(Test-Path $routerPath)) {
  Write-Host "router.ts not found, skipping persona router patch"
  exit 0
}

$content = Get-Content -Raw -Path $routerPath

if ($content -notmatch 'systemPromptForTask') {
  $content = $content -replace 'import type \{ AIProvider, AIRequest, AIResponse \} from "\./types"', 'import type { AIProvider, AIRequest, AIResponse } from "./types"' + "`r`n" + 'import { systemPromptForTask } from "./persona"'

  $old = 'messages: input.messages?.slice(-Number(process.env.CHAT_HISTORY_WINDOW || 12)),'
  $new = @'
messages: (() => {
      const windowed = input.messages?.slice(-Number(process.env.CHAT_HISTORY_WINDOW || 12)) || []
      const hasSystem = windowed.some((message) => message.role === "system")
      return hasSystem ? windowed : [{ role: "system" as const, content: systemPromptForTask(task) }, ...windowed]
    })(),
'@
  if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
  }

  Set-Content -Path $routerPath -Value $content -Encoding UTF8
  Write-Host "Persona system prompt patched into router.ts"
} else {
  Write-Host "Persona router patch already exists"
}
