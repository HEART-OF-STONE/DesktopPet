$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root=Split-Path $PSScriptRoot -Parent
$fixture=Join-Path $root ('.cache/hidpi-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$env:DESKTOPPET_DATA_DIR=$fixture
$env:CODEX_HOME=Join-Path $fixture 'codex'
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $fixture 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
$env:PWTEST_DAEMON_SESSION_DIR=Join-Path $root '.cache/playwright'
$app=Start-Process -FilePath (Join-Path $root 'src-tauri/target/debug/desktop-pet.exe') -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Seconds 3
    npx --yes --package '@playwright/cli' playwright-cli -s=hidpi open about:blank
    $PSNativeCommandUseErrorActionPreference=$false
    $result=& npx --yes --package '@playwright/cli' playwright-cli -s=hidpi run-code --filename scripts/native-hidpi-smoke.js 2>&1
    $exitCode=$LASTEXITCODE
    $text=$result -join "`n"
    if ($exitCode -ne 0 -or $text.Contains('### Error')) { throw $text }
    $text.Split('### Ran Playwright code')[0] | Write-Output
} finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id }
    npx --yes --package '@playwright/cli' playwright-cli -s=hidpi close
}
