param([string]$CodexDirectory=(Join-Path $env:USERPROFILE '.codex'))
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root=Split-Path $PSScriptRoot -Parent
$probeDirectory=Join-Path $root ('.cache/agent-real-' + [guid]::NewGuid().ToString())
$env:DESKTOPPET_DATA_DIR=$probeDirectory
$env:CODEX_HOME=$CodexDirectory
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $probeDirectory 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
$env:PWTEST_DAEMON_SESSION_DIR=Join-Path $root '.cache/playwright'
$probe=Start-Process -FilePath (Join-Path $root 'src-tauri/target/debug/desktop-pet.exe') -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Seconds 3
    npx --yes --package '@playwright/cli' playwright-cli -s=agent-live open about:blank
    if ($LASTEXITCODE -ne 0) { throw 'Browser launch failed' }
    $result=& npx --yes --package '@playwright/cli' playwright-cli -s=agent-live run-code --filename scripts/native-agent-live.js 2>&1
    $code=$LASTEXITCODE
    $resultText=$result -join "`n"
    $resultText.Split('### Ran Playwright code')[0] | Write-Output
    if ($code -ne 0 -or $resultText.Contains('### Error')) { throw $resultText }
} finally {
    if (-not $probe.HasExited) { Stop-Process -Id $probe.Id }
    npx --yes --package '@playwright/cli' playwright-cli -s=agent-live close
    if ($LASTEXITCODE -ne 0) { throw 'Browser close failed' }
}
