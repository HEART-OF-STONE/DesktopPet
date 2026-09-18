param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$SessionId,
    [Parameter(Mandatory)][string]$TurnId,
    [Parameter(Mandatory)][ValidateSet('running','completed','failed','waiting','interrupted')][string]$Status,
    [string]$EventId = [guid]::NewGuid().ToString(),
    [string]$DiscoveryFile,
    [switch]$Quiet
)
$ErrorActionPreference = 'Stop'
try {
    if (-not $DiscoveryFile) {
        $dataDirectory = if ($env:DESKTOPPET_DATA_DIR) { $env:DESKTOPPET_DATA_DIR } else { Join-Path $env:APPDATA 'com.desktop-pet.companion' }
        $DiscoveryFile = Join-Path $dataDirectory 'agent-bridge.json'
    }
    $connection = Get-Content -LiteralPath $DiscoveryFile -Encoding UTF8 -Raw | ConvertFrom-Json
    $uri = [uri]$connection.url
    if ($uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.AbsolutePath -ne '/v1/events' -or $uri.UserInfo) { throw 'Invalid local bridge address' }
    $event = @{eventId=$EventId; source=$Source; sessionId=$SessionId; turnId=$TurnId; status=$Status; timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
    $body = $event | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri $uri -Method Post -Headers @{Authorization="Bearer $($connection.token)"} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 2
    if (-not $Quiet) { Write-Output '桌边已收到事件。' }
} catch {
    if (-not $Quiet) { throw '无法发送事件：请启动桌边并启用本地事件接口，检查标识字段是否有效。' }
}
