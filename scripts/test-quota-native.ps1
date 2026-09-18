param([switch]$SidePanel,[switch]$BottomPanel,[switch]$Placement,[switch]$DesktopExperience)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root = Split-Path $PSScriptRoot -Parent
$testData = Join-Path $root ('.cache/quota-native-' + [guid]::NewGuid().ToString())
$sessions = Join-Path $testData 'codex/sessions'
New-Item -ItemType Directory -Path $sessions -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $root 'output/playwright') -Force | Out-Null
$now = [DateTimeOffset]::UtcNow
$rows = @()
foreach ($bucket in @('codex','codex_bengalfox')) {
    $at = if ($bucket -eq 'codex') { $now.AddMinutes(-2) } else { $now.AddMinutes(-1) }
    $used = if ($bucket -eq 'codex') { 24 } else { 0 }
    $rows += @{timestamp=$at.ToString('o');type='event_msg';payload=@{type='token_count';rate_limits=@{limit_id=$bucket;primary=@{used_percent=$used;window_minutes=300;resets_at=$now.AddHours(3).ToUnixTimeSeconds()};secondary=@{used_percent=$used;window_minutes=10080;resets_at=$now.AddDays(5).ToUnixTimeSeconds()}}}}
}
$jsonl = ($rows | ForEach-Object { $_ | ConvertTo-Json -Depth 8 -Compress }) -join "`n"
Set-Content -LiteralPath (Join-Path $sessions 'rollout-quota.jsonl') -Value $jsonl -Encoding UTF8
$env:DESKTOPPET_DATA_DIR = $testData
$env:CODEX_HOME = Join-Path $testData 'codex'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $testData 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
$env:PWTEST_DAEMON_SESSION_DIR = Join-Path $root '.cache/playwright'
$app = $null
try {
    npx --yes --package '@playwright/cli' playwright-cli -s=quota-native open about:blank
    foreach ($pass in @('initial','restart')) {
        $app = Start-Process -FilePath (Join-Path $root 'src-tauri/target/debug/desktop-pet.exe') -WindowStyle Hidden -PassThru
        Start-Sleep -Seconds 3
        $script = if ($DesktopExperience) { 'scripts/native-desktop-experience.js' } elseif ($Placement) { 'scripts/native-placement-smoke.js' } elseif ($BottomPanel) { 'scripts/native-bottompanel-smoke.js' } elseif ($SidePanel) { 'scripts/native-sidepanel-smoke.js' } else { 'scripts/native-quota-smoke.js' }
        try {
            $PSNativeCommandUseErrorActionPreference = $false
            $result = & npx --yes --package '@playwright/cli' playwright-cli -s=quota-native run-code --filename $script 2>&1
            $scriptExit = $LASTEXITCODE
        } finally { $PSNativeCommandUseErrorActionPreference = $true }
        $text = $result -join "`n"
        if ($scriptExit -ne 0 -or $text.Contains('### Error')) { throw "${pass}: $text" }
        $text.Split('### Ran Playwright code')[0] | Write-Output
        Stop-Process -Id $app.Id
        $app.WaitForExit()
        $app = $null
    }
    Write-Output "Quota native and restart passed: $testData"
} finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id }
    npx --yes --package '@playwright/cli' playwright-cli -s=quota-native close
}
