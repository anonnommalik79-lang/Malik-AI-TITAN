param(
  [switch]$SkipBuild,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

function Say($Text, $Color = "Cyan") {
  Write-Host $Text -ForegroundColor $Color
}

function Get-RepoRoot {
  try {
    $root = git rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $root) { return $root.Trim() }
  } catch {}
  throw "Git repo not found. Open Malik-AI-TITAN folder first."
}

$RepoRoot = Get-RepoRoot
$ScriptDir = Join-Path $RepoRoot "app\templates\sovereign-hub-ui\scripts"
$BrokenInstaller = Join-Path $ScriptDir "INSTALL_MALIK_LIVE_RESEARCH_GOD.ps1"
$FixedInstaller = Join-Path $ScriptDir "INSTALL_MALIK_LIVE_RESEARCH_GOD.fixed.ps1"

if (!(Test-Path $BrokenInstaller)) {
  throw "Installer not found: $BrokenInstaller"
}

Say "Repairing MALIK installer PowerShell here-strings..." "Cyan"

$lines = [System.IO.File]::ReadAllLines($BrokenInstaller)
$out = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]

  if ($line -match "^(?<cmd>\s*Write-Utf8File\s+.+?)\s+@'\s*$") {
    $cmd = $Matches["cmd"]
    $out.Add('$__malik_content = @''') | Out-Null

    $i++
    while ($i -lt $lines.Count) {
      $out.Add($lines[$i]) | Out-Null
      if ($lines[$i] -eq "'@") { break }
      $i++
    }

    $out.Add("$cmd `$__malik_content") | Out-Null
  } else {
    $out.Add($line) | Out-Null
  }
}

[System.IO.File]::WriteAllLines($FixedInstaller, $out, [System.Text.UTF8Encoding]::new($false))
Say "Fixed installer created: $FixedInstaller" "Green"

$passArgs = @()
if ($SkipBuild) { $passArgs += "-SkipBuild" }
if ($NoPush) { $passArgs += "-NoPush" }

Say "Running fixed installer..." "Cyan"
& powershell -ExecutionPolicy Bypass -File $FixedInstaller @passArgs
