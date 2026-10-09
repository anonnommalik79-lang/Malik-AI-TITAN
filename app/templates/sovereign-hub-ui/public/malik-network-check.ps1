param([string]$BaseUrl = "https://malikaiworld.world")

# Read-only checks. No DNS, proxy, firewall, hosts or browser settings change.
$ErrorActionPreference = "Continue"
try { $siteUri = [uri]$BaseUrl } catch { throw "Provide a valid HTTPS URL." }
if (-not $siteUri.IsAbsoluteUri -or $siteUri.Scheme -ne "https" -or $siteUri.UserInfo) {
    throw "Provide an HTTPS URL without credentials."
}
$siteHost = $siteUri.DnsSafeHost
$originUrl = $siteUri.GetLeftPart([System.UriPartial]::Authority)
Write-Output "Malik AI connection checks (read-only)"
Write-Output "Target: $originUrl"
Write-Output "DNS from this computer:"
try {
    $dnsRecords = Resolve-DnsName -Name $siteHost -DnsOnly -ErrorAction Stop
    $dnsRecords | Where-Object { $_.Type -in @("A", "AAAA", "CNAME") } |
        Select-Object Name, Type, IPAddress, NameHost | Format-Table -AutoSize
    foreach ($record in $dnsRecords) {
        if ($record.IPAddress -in @("0.0.0.0", "127.0.0.1", "::", "::1")) {
            Write-Output "DNS returned an unusable/local address. Ask the network administrator to check filtering."
        }
    }
} catch { Write-Output "DNS failed: $($_.Exception.Message)" }

Write-Output "Active hosts entries for the target:"
$hostsFile = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$targetPattern = "(?i)(^|\s)" + [regex]::Escape($siteHost) + "(\s|$)"
$entries = Get-Content $hostsFile -ErrorAction SilentlyContinue |
    ForEach-Object { ($_ -split "#", 2)[0].Trim() } |
    Where-Object { $_ -and $_ -match $targetPattern }
if ($entries) { $entries | Write-Output } else { Write-Output "None." }

# TLS 1.2 for Windows PowerShell 5.1; certificate validation stays enabled.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
foreach ($path in @("/", "/api/health")) {
    try {
        $result = Invoke-WebRequest -Uri ($originUrl + $path) -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        Write-Output "HTTP $path : $([int]$result.StatusCode)"
    } catch {
        Write-Output "HTTP $path failed: $($_.Exception.Message)"
        if ($_.Exception.Response) { Write-Output "Status: $([int]$_.Exception.Response.StatusCode)" }
    }
}
Write-Output "PowerShell uses its own proxy settings. If these checks pass but Edge fails, ask the administrator to check Edge policies and its proxy."
Write-Output "If the site is forbidden by network policy, its administrator must approve access."
