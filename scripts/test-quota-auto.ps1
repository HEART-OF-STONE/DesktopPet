$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root = Split-Path $PSScriptRoot -Parent
$testData = Join-Path $root ('.cache/quota-auto-' + [guid]::NewGuid().ToString())
$testHome = Join-Path $testData 'codex'
New-Item -ItemType Directory -Path (Join-Path $testHome 'sessions') -Force | Out-Null
$env:CARGO_HOME = Join-Path $root '.tools/cargo'
$env:RUSTUP_HOME = Join-Path $root '.tools/rustup'
$fixture = Join-Path $testData 'quota-server.exe'
& (Join-Path $root '.tools/cargo/bin/rustc.exe') (Join-Path $root 'scripts/fixtures/quota-server.rs') -o $fixture
$statePath = Join-Path $testData 'integrations.json'
$initial = @{version=1;settings=@{codexEnabled=$true;codexHome=$testHome;codexExecutable=$fixture};quota=@{windows=@()}}
$initial | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $statePath -Encoding UTF8
$env:DESKTOPPET_DATA_DIR = $testData
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $testData 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
$env:PWTEST_DAEMON_SESSION_DIR = Join-Path $root '.cache/playwright'
$app = $null
function Request-Count { if(Test-Path -LiteralPath (Join-Path $testHome 'quota-requests.txt')){@(Get-Content -LiteralPath (Join-Path $testHome 'quota-requests.txt') -Encoding UTF8).Count}else{0} }
function Stop-TestApp { Stop-Process -Id $script:app.Id; $script:app.WaitForExit(); $script:app=$null }
function Start-TestApp { $script:app=Start-Process -FilePath (Join-Path $root 'src-tauri/target/debug/desktop-pet.exe') -WindowStyle Hidden -PassThru }
function Read-State { Get-Content -LiteralPath $statePath -Encoding UTF8 -Raw | ConvertFrom-Json }
function Save-State($value) { $value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $statePath -Encoding UTF8 }
function Wait-Attempt($count) {
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    do { Start-Sleep -Milliseconds 250; $state=Read-State } while(((Request-Count) -lt $count -or $state.quotaPoll.lastAttemptAt -eq $null) -and [DateTime]::UtcNow -lt $deadline)
    Start-Sleep -Seconds 1
    if((Request-Count) -ne $count){throw 'Unexpected quota request count'}
    Read-State
}
try {
    npx --yes --package '@playwright/cli' playwright-cli -s=quota-auto open about:blank
    foreach($pass in @('initial','restart')){
        Start-TestApp
        $state=Wait-Attempt 1
        $result = & npx --yes --package '@playwright/cli' playwright-cli -s=quota-auto run-code --filename scripts/native-quota-auto-smoke.js 2>&1
        $text=$result -join "`n"
        if($LASTEXITCODE -ne 0 -or $text.Contains('### Error')){throw $text}
        $text.Split('### Ran Playwright code')[0] | Write-Output
        if((Request-Count) -ne 1){throw 'Restart or manual click bypassed cooldown'}
        Stop-TestApp
    }
    # Force only the synthetic clock state overdue; no real ten-minute waits.
    $state=Read-State; $state.quotaPoll.nextAttemptAt=0; $state.quota.windows[0].updatedAt=1; $state.quota.updatedAt=1
    Save-State $state
    Set-Content -LiteralPath (Join-Path $testHome 'fail-quota') -Value 'fixture' -Encoding UTF8
    Start-TestApp; $state=Wait-Attempt 2
    if($state.quotaPoll.failures -ne 1 -or !$state.quota.error -or $state.quota.windows[0].usedPercent -ne 30){throw 'Failed query did not preserve previous quota'}
    Stop-TestApp
    Start-TestApp; Start-Sleep -Seconds 3
    if((Request-Count) -ne 2){throw 'Failure cooldown lost on restart'}
    Stop-TestApp
    $state=Read-State; $state.settings.codexEnabled=$false; $state.quotaPoll.nextAttemptAt=0; Save-State $state
    Start-TestApp; Start-Sleep -Seconds 3
    if((Request-Count) -ne 2){throw 'Disabled integration queried quota'}
    Stop-TestApp
    Write-Output 'PASS: startup update, concurrent manual cooldown, restart budget, failure retention, disabled integration. Only local fake server used.'
} finally {
    if($app -and -not $app.HasExited){Stop-TestApp}
    npx --yes --package '@playwright/cli' playwright-cli -s=quota-auto close
}
