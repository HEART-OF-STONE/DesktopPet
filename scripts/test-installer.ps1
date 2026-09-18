$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root = Split-Path $PSScriptRoot -Parent
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$installer = Join-Path $root "src-tauri/target/release/bundle/nsis/DesktopPet Installer Test_${version}_x64-setup.exe"
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DesktopPet Installer Test'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'DesktopPet.com.desktop-pet.installer-test'
if (Test-Path -LiteralPath $uninstallKey) { throw 'Test product is already installed; inspect it first.' }
if ((Get-ItemProperty -LiteralPath $runKey).PSObject.Properties[$runName]) { throw 'Test startup entry already exists; inspect it first.' }
if (Get-Process -Name 'desktop-pet' -ErrorAction SilentlyContinue) { throw 'Another desktop-pet.exe is running; finish native tests before installer testing.' }
$fixture = Join-Path $root ('.cache/installer-' + [guid]::NewGuid().ToString())
$install = [IO.Path]::GetFullPath((Join-Path $fixture 'app'))
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $root '.cache')) + [IO.Path]::DirectorySeparatorChar
if (-not $install.StartsWith($cacheRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Installer target must stay inside workspace cache.' }
$testData = Join-Path $fixture 'data'
New-Item -ItemType Directory -Path $testData -Force | Out-Null
$env:DESKTOPPET_DATA_DIR=$testData
$env:CODEX_HOME=Join-Path $fixture 'codex'
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $fixture 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9224'
$env:PWTEST_DAEMON_SESSION_DIR=Join-Path $root '.cache/playwright'
$app=$null
function Run-Installer([string]$File,[string]$Arguments) {
    $process=Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(60000)) { throw "Installer did not finish within 60 seconds (PID $($process.Id))." }
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
}
function Run-Smoke {
    $PSNativeCommandUseErrorActionPreference=$false
    $result=& npx --yes --package '@playwright/cli' playwright-cli -s=installer-native run-code --filename scripts/native-installer-smoke.js 2>&1
    $code=$LASTEXITCODE
    $text=$result -join "`n"
    if ($code -ne 0 -or $text.Contains('### Error')) { throw $text }
    $text.Split('### Ran Playwright code')[0] | Write-Output
}
try {
    Run-Installer $installer "/S /NS /D=$install"
    $allowed=@('desktop-pet.exe','uninstall.exe','START-HERE.md','AGENT-GUIDE.md','CHARACTER-GUIDE.md','send-agent-event.ps1','codex-hook.ps1','LICENSE','THIRD_PARTY_NOTICES.md','THIRD_PARTY_LICENSES.txt','DeepSeek-Balance-Whale-Widget-MIT.txt')
    $actual=@(Get-ChildItem -LiteralPath $install -File | Select-Object -ExpandProperty Name)
    if (@(Compare-Object ($allowed | Sort-Object) ($actual | Sort-Object)).Count) { throw 'Installer resource allowlist mismatch' }
    if ((Get-ItemProperty -LiteralPath $uninstallKey).DisplayVersion -ne $version) { throw 'Uninstall registration missing or wrong version' }
    if ((Get-ItemProperty -LiteralPath $runKey).PSObject.Properties[$runName]) { throw 'Installation enabled startup without opt-in' }
    $app=Start-Process -FilePath (Join-Path $install 'desktop-pet.exe') -ArgumentList '--autostart' -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    npx --yes --package '@playwright/cli' playwright-cli -s=installer-native open about:blank
    Run-Smoke
    Stop-Process -Id $app.Id
    $app.WaitForExit()
    $statePath=Join-Path $testData 'state.json'
    $before=(Get-FileHash -LiteralPath $statePath).Hash
    # A moved portable path simulates the previous installation's startup entry.
    Set-ItemProperty -LiteralPath $runKey -Name $runName -Value ('"' + (Join-Path $fixture 'old/DesktopPet.exe') + '" --autostart')
    Run-Installer $installer "/S /NS /UPDATE /D=$install"
    $expected='"' + (Join-Path $install 'desktop-pet.exe') + '" --autostart'
    if ((Get-ItemProperty -LiteralPath $runKey).PSObject.Properties[$runName].Value -ne $expected) { throw 'Update did not repair startup location' }
    if ((Get-FileHash -LiteralPath $statePath).Hash -ne $before) { throw 'Update changed user data' }
    # _?= runs the uninstaller in-place so completion is observable without detached deletion.
    Run-Installer (Join-Path $install 'uninstall.exe') "/S _?=$install"
    if (Test-Path -LiteralPath (Join-Path $install 'desktop-pet.exe')) { throw 'Uninstall left application executable' }
    if (Test-Path -LiteralPath $uninstallKey) { throw 'Uninstall left product registration' }
    if ((Get-ItemProperty -LiteralPath $runKey).PSObject.Properties[$runName]) { throw 'Uninstall left own startup entry' }
    if ((Get-FileHash -LiteralPath $statePath).Hash -ne $before) { throw 'Uninstall changed retained user data' }
    [pscustomobject]@{Passed=@('current-user silent install','resource allowlist','no unsolicited startup','installed native smoke','update preserves data and repairs startup','uninstall cleans startup and preserves data');Fixture=$fixture} | ConvertTo-Json
} finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id }
    npx --yes --package '@playwright/cli' playwright-cli -s=installer-native close
}
