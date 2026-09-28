param([string]$PreviousVersion)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$installer = Join-Path $root "src-tauri/target/release/bundle/nsis/DesktopPet Location Test_${version}_x64-setup.exe"
$initialInstaller = $installer
if ($PreviousVersion) {
    if ($PreviousVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid previous version.' }
    $initialInstaller = Join-Path $root "src-tauri/target/release/bundle/nsis/DesktopPet Location Test_${PreviousVersion}_x64-setup.exe"
}
$productKey = 'HKCU:\Software\desktop-pet\DesktopPet Location Test'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DesktopPet Location Test'
if ((Test-Path -LiteralPath $productKey) -or (Test-Path -LiteralPath $uninstallKey)) { throw 'Isolated test product already exists; inspect before testing.' }
if (Get-Process -Name 'desktop-pet' -ErrorAction SilentlyContinue) { throw 'Close desktop-pet processes before testing.' }
$fixture = Join-Path $root ('.cache/install-location-' + [guid]::NewGuid().ToString())
$install = [IO.Path]::GetFullPath((Join-Path $fixture '我的软件\Desktop Pet'))
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $root '.cache')) + [IO.Path]::DirectorySeparatorChar
if (-not $install.StartsWith($cacheRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test install must stay within workspace cache.' }
$fallback = Join-Path $env:LOCALAPPDATA 'DesktopPet Location Test'
if (Test-Path -LiteralPath $fallback) { throw 'Isolated default directory already exists; inspect before testing.' }
function Run-Installer([string]$File, [string]$Arguments) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(60000)) { throw "Test installer timed out (PID $($process.Id))." }
    if ($process.ExitCode -ne 0) { throw "Test installer failed: $($process.ExitCode)" }
}
function Assert-Location([string]$ExpectedVersion) {
    if (-not (Test-Path -LiteralPath (Join-Path $install 'desktop-pet.exe'))) { throw 'Executable missing from selected folder.' }
    if ((Get-Item -LiteralPath (Join-Path $install 'desktop-pet.exe')).VersionInfo.ProductVersion -ne $ExpectedVersion) { throw 'Installed executable version differs from expected version.' }
    if ((Get-ItemProperty -LiteralPath $uninstallKey).DisplayVersion -ne $ExpectedVersion) { throw 'Registered version differs from expected version.' }
    if ((Get-ItemProperty -LiteralPath $uninstallKey).InstallLocation.Trim('"') -ne $install) { throw 'Registered installation path differs from selected folder.' }
    if (Test-Path -LiteralPath $fallback) { throw 'Installer unexpectedly used default directory.' }
}
Run-Installer $initialInstaller "/S /NS /D=$install"
Assert-Location $(if ($PreviousVersion) { $PreviousVersion } else { $version })
$marker = Join-Path $install 'retained-test-file.txt'
Set-Content -LiteralPath $marker -Value 'retain on update' -Encoding UTF8
$before = (Get-FileHash -LiteralPath $marker).Hash
# Manual reinstallation without /D must restore the previously chosen location.
Run-Installer $installer '/S /NS /UPDATE'
Assert-Location $version
# Simulate a stale path without changing production registration. The app's final
# unquoted /D argument must override it, including Chinese and spaces.
Set-Item -LiteralPath $productKey -Value (Join-Path $fixture 'obsolete')
Run-Installer $installer "/S /NS /UPDATE /D=$install"
Assert-Location $version
if ((Get-FileHash -LiteralPath $marker).Hash -ne $before) { throw 'Update changed the retained test file.' }
# Keep the cache evidence; remove only this unique test product's registration
# and installed files through its own uninstaller, with a verified target.
Run-Installer (Join-Path $install 'uninstall.exe') "/S _?=$install"
if (Test-Path -LiteralPath $uninstallKey) { throw 'Test uninstall left installed-app registration.' }
if (Test-Path -LiteralPath (Join-Path $install 'desktop-pet.exe')) { throw 'Test uninstall left the executable.' }
if ((Get-FileHash -LiteralPath $marker).Hash -ne $before) { throw 'Uninstall changed an unrelated file.' }
# NSIS intentionally remembers the last directory unless the user deletes app
# data. Remove only this run's isolated registry memory so the test is repeatable.
if (Test-Path -LiteralPath $productKey) {
    if ((Get-Item -LiteralPath $productKey).GetValue('') -ne $install) { throw 'Unexpected test directory memory; refuse cleanup.' }
    Remove-Item -LiteralPath $productKey
}
[pscustomobject]@{ FromVersion = $(if ($PreviousVersion) { $PreviousVersion } else { $version }); ToVersion = $version; Passed = @('Chinese and spaced custom directory', 'manual update remembers directory', 'explicit update path overrides stale registration', 'no fallback install', 'unrelated file retained', 'isolated uninstall'); Fixture = $fixture } | ConvertTo-Json
