param([string]$SigningKeyPath = (Join-Path $env:LOCALAPPDATA 'DesktopPet/signing/updater.key'))
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
# CI provides the secret directly; local builds read only the external key path.
$previousKey = $env:TAURI_SIGNING_PRIVATE_KEY
try {
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
        if (-not (Test-Path -LiteralPath $SigningKeyPath)) { throw 'Updater signing key missing. Restore the original key from your secure backup.' }
        $env:TAURI_SIGNING_PRIVATE_KEY = (Resolve-Path -LiteralPath $SigningKeyPath).Path
    }
    npm run security:check
    node scripts/generate-license-notices.mjs
    npm run desktop:build -- --ci --bundles nsis
    & (Join-Path $PSScriptRoot 'package-release.ps1')
} finally { $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey }
