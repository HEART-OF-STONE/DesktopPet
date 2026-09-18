param([string]$Version)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }
if ($Version -notmatch '^\d+\.\d+\.\d+$' -or $Version -ne $package.version) { throw 'Version must match package.json' }
$executable = Join-Path $root 'src-tauri/target/release/desktop-pet.exe'
if ((Get-Item -LiteralPath $executable).VersionInfo.ProductVersion -ne $Version) { throw 'Build the matching release executable first' }
if ((Get-Item -LiteralPath $executable).VersionInfo.ProductName -ne 'DesktopPet') { throw 'Test application cannot be distributed as production' }
$installerSource = Join-Path $root "src-tauri/target/release/bundle/nsis/DesktopPet_${Version}_x64-setup.exe"
$installerItem = Get-Item -LiteralPath $installerSource
# Tauri restores the standalone binary after bundling; allow filesystem timestamp rounding.
if ($installerItem.VersionInfo.ProductName -ne 'DesktopPet' -or $installerItem.VersionInfo.ProductVersion -ne $Version -or $installerItem.LastWriteTimeUtc.AddSeconds(2) -lt (Get-Item -LiteralPath $executable).LastWriteTimeUtc) { throw 'Build the matching production NSIS installer first' }
$bundleConfig = Get-Content -LiteralPath (Join-Path $root 'src-tauri/tauri.conf.json') -Encoding UTF8 -Raw | ConvertFrom-Json
foreach ($resource in $bundleConfig.bundle.resources.PSObject.Properties) {
    $resourcePath = Join-Path (Join-Path $root 'src-tauri') $resource.Name
    if ($installerItem.LastWriteTimeUtc.AddSeconds(2) -lt (Get-Item -LiteralPath $resourcePath).LastWriteTimeUtc) {
        throw 'Installer predates a bundled guide or license. Rebuild NSIS before packaging.'
    }
}
$destination = Join-Path $root "output/DesktopPet-v$Version"
$zip = Join-Path $root "output/DesktopPet-v$Version-windows-x64.zip"
$installer = Join-Path $root "output/DesktopPet-v$Version-windows-x64-setup.exe"
$checksums = Join-Path $root "output/DesktopPet-v$Version-SHA256SUMS.txt"
foreach ($path in @($zip,$installer,$checksums)) { if (Test-Path -LiteralPath $path) { throw "Release artifact already exists: $path. Review it before replacing a published artifact." } }
if (Test-Path -LiteralPath $destination) {
    if (@(Get-ChildItem -LiteralPath $destination -Force).Count) { throw "Release directory is not empty: $destination. Use a new version or review its existing files first." }
} else { New-Item -ItemType Directory -Path $destination | Out-Null }
# Explicit allowlist: never traverse dev/, source, caches, credentials or user data.
$files = [ordered]@{
    'DesktopPet.exe' = $executable
    'LICENSE' = (Join-Path $root 'LICENSE')
    'THIRD_PARTY_NOTICES.md' = (Join-Path $root 'THIRD_PARTY_NOTICES.md')
    'THIRD_PARTY_LICENSES.txt' = (Join-Path $root 'THIRD_PARTY_LICENSES.txt')
    'DeepSeek-Balance-Whale-Widget-MIT.txt' = (Join-Path $root 'licenses/DeepSeek-Balance-Whale-Widget-MIT.txt')
    'START-HERE.md' = (Join-Path $root 'docs/08-sharing.md')
    'AGENT-GUIDE.md' = (Join-Path $root 'docs/07-agent-guide.md')
    'CHARACTER-GUIDE.md' = (Join-Path $root 'docs/04-character-packs.md')
    'send-agent-event.ps1' = (Join-Path $root 'scripts/send-agent-event.ps1')
    'codex-hook.ps1' = (Join-Path $root 'scripts/codex-hook.ps1')
}
foreach ($entry in $files.GetEnumerator()) { Copy-Item -LiteralPath $entry.Value -Destination (Join-Path $destination $entry.Key) }
$paths = @($files.Keys | ForEach-Object { Join-Path $destination $_ })
Compress-Archive -LiteralPath $paths -DestinationPath $zip -CompressionLevel Optimal
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    $actual = @($archive.Entries | ForEach-Object { $_.FullName })
    if (@(Compare-Object @($files.Keys | Sort-Object) @($actual | Sort-Object)).Count) { throw 'Unexpected ZIP contents' }
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -match '(?i)todo|^dev/|\.codex|agent-bridge\.json|state\.json|integrations\.json') { throw 'Development or personal data found in release' }
    }
} finally { $archive.Dispose() }
Copy-Item -LiteralPath $installerSource -Destination $installer
$hashes=@($zip,$installer | ForEach-Object { $hash=Get-FileHash -LiteralPath $_ -Algorithm SHA256; "$($hash.Hash.ToLowerInvariant())  $(Split-Path $_ -Leaf)" })
Set-Content -LiteralPath $checksums -Value $hashes -Encoding UTF8
[pscustomobject]@{ ZIP=$zip;Installer=$installer;Checksums=$checksums;Files=$actual;SHA256=$hashes } | ConvertTo-Json
