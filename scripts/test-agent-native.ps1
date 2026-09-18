param([switch]$P0Only,[switch]$P1Only,[switch]$EstimateOnly)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
function Invoke-AgentSmoke([string]$Script) {
    $PSNativeCommandUseErrorActionPreference = $false
    $result = & npx --yes --package '@playwright/cli' playwright-cli -s=agent-native run-code --filename $Script 2>&1
    $exitCode = $LASTEXITCODE
    $text = $result -join "`n"
    if ($exitCode -ne 0 -or $text.Contains('### Error')) { throw "${Script}: $text" }
    $text.Split('### Ran Playwright code')[0] | Write-Output
}
$root = Split-Path $PSScriptRoot -Parent
$startupKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$startupName = 'DesktopPet.com.desktop-pet.rename-test'
$startupPrevious = $null
if ($P1Only) {
    $item = Get-ItemProperty -LiteralPath $startupKey -ErrorAction SilentlyContinue
    if ($item -and $item.PSObject.Properties[$startupName]) { $startupPrevious = $item.PSObject.Properties[$startupName].Value; Remove-ItemProperty -LiteralPath $startupKey -Name $startupName }
}
$testData = Join-Path $root ('.cache/agent-native-' + [guid]::NewGuid().ToString())
$sessions = Join-Path $testData 'codex/sessions'
New-Item -ItemType Directory -Path $sessions -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $root 'output/playwright') -Force | Out-Null
$at = [DateTimeOffset]::UtcNow.AddMinutes(-5).ToString('o')
if ($EstimateOnly) { $at = [DateTimeOffset]::UtcNow.ToString('o') }
$rows = @(
    @{timestamp=$at;type='session_meta';payload=@{id='fixture-session'}}
    @{timestamp=$at;type='turn_context';payload=@{turn_id='fixture-turn';model='fixture-model'}}
    @{timestamp=$at;type='event_msg';payload=@{type='task_started';turn_id='fixture-turn'}}
)
foreach ($total in @(100,100,140)) {
    $rows += @{timestamp=$at;type='event_msg';payload=@{type='token_count';info=@{total_token_usage=@{input_tokens=$total-30;cached_input_tokens=40;output_tokens=30;reasoning_output_tokens=10;total_tokens=$total}};rate_limits=@{limit_id='codex';primary=@{used_percent=24;window_minutes=300;resets_at=[DateTimeOffset]::UtcNow.AddHours(3).ToUnixTimeSeconds()}}}}
}
$rows += @{timestamp=$at;type='event_msg';payload=@{type='task_complete';turn_id='fixture-turn'}}
$jsonl = ($rows | ForEach-Object { $_ | ConvertTo-Json -Depth 8 -Compress }) -join "`n"
Set-Content -LiteralPath (Join-Path $sessions 'rollout-fixture.jsonl') -Value $jsonl -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $sessions 'rollout-fixture.jsonl') -Destination (Join-Path $sessions 'rollout-fork-copy.jsonl')
$env:DESKTOPPET_DATA_DIR=$testData
$env:CODEX_HOME=Join-Path $testData 'codex'
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $testData 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
$env:PWTEST_DAEMON_SESSION_DIR=Join-Path $root '.cache/playwright'
$app = Start-Process -FilePath (Join-Path $root 'src-tauri/target/debug/desktop-pet.exe') -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Seconds 3
    npx --yes --package '@playwright/cli' playwright-cli -s=agent-native open about:blank
    Invoke-AgentSmoke scripts/native-agent-smoke.js
    if (-not $P0Only -and -not $P1Only -and -not $EstimateOnly) {
    Invoke-AgentSmoke scripts/native-agent-presentation.js
    $connection=Get-Content -LiteralPath (Join-Path $testData 'agent-bridge.json') -Encoding UTF8 -Raw | ConvertFrom-Json
    $event=@{eventId='stable-1';source='test-agent';sessionId='bridge-session';turnId='bridge-turn';status='completed';timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();tokens=@{input=80;cached=20;output=20;reasoning=10;total=100};model='fixture-model'}
    $body=$event | ConvertTo-Json -Depth 5 -Compress
    $unauthorized=Invoke-WebRequest -Uri $connection.url -Method Post -ContentType 'application/json' -Body $body -SkipHttpErrorCheck
    if ($unauthorized.StatusCode -ne 401) { throw 'Unauthenticated bridge request accepted' }
    foreach ($repeat in 1..2) { $null=Invoke-RestMethod -Uri $connection.url -Method Post -Headers @{Authorization="Bearer $($connection.token)"} -ContentType 'application/json' -Body $body }
    Invoke-AgentSmoke scripts/native-agent-events.js
    & (Join-Path $PSScriptRoot 'send-agent-event.ps1') -Source 'test-agent' -SessionId 'bridge-session' -TurnId 'waiting-turn' -Status waiting -EventId 'stable-2'
    Invoke-AgentSmoke scripts/native-agent-quiet.js
    Stop-Process -Id $app.Id
    $app.WaitForExit()
    $app=Start-Process -FilePath (Join-Path $root 'src-tauri/target/debug/desktop-pet.exe') -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    Invoke-AgentSmoke scripts/native-agent-restart.js
    $liveAt=[DateTimeOffset]::UtcNow.ToString('o')
    $liveRows=@(
        @{timestamp=$liveAt;type='event_msg';payload=@{type='task_started';turn_id='live-turn'}}
        @{timestamp=$liveAt;type='event_msg';payload=@{type='token_count';info=@{total_token_usage=@{input_tokens=160;cached_input_tokens=50;output_tokens=40;reasoning_output_tokens=10;total_tokens=200}}}}
        @{timestamp=$liveAt;type='event_msg';payload=@{type='task_complete';turn_id='live-turn'}}
    )
    $liveJson=($liveRows | ForEach-Object { $_ | ConvertTo-Json -Depth 8 -Compress }) -join "`n"
    Add-Content -LiteralPath (Join-Path $sessions 'rollout-fixture.jsonl') -Value $liveJson -Encoding UTF8
    Invoke-AgentSmoke scripts/native-agent-live-event.js
    }
    if ($EstimateOnly) {
        $connection=Get-Content -LiteralPath (Join-Path $testData 'agent-bridge.json') -Encoding UTF8 -Raw | ConvertFrom-Json
        foreach ($model in @('fixture-priced','fixture-unknown','fixture-priced')) {
            $tokens=if($model -eq 'fixture-priced'){@{input=1000000;cached=400000;output=100000;reasoning=50000;total=1100000}}else{@{input=60;cached=20;output=40;reasoning=20;total=100}}
            $event=@{eventId="cost-$model";source='cost-agent';sessionId='cost-session';turnId=$model;status='completed';timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();model=$model;tokens=$tokens}
            $body=$event | ConvertTo-Json -Depth 5 -Compress
            $null=Invoke-RestMethod -Uri $connection.url -Method Post -Headers @{Authorization="Bearer $($connection.token)"} -ContentType 'application/json' -Body $body
        }
        Invoke-AgentSmoke scripts/native-estimate-smoke.js
    } elseif ($P1Only) {
        Invoke-AgentSmoke scripts/native-p1-prep.js
        $connection=Get-Content -LiteralPath (Join-Path $testData 'agent-bridge.json') -Encoding UTF8 -Raw | ConvertFrom-Json
        foreach ($state in @('waiting','failed','waiting')) {
            $event=@{eventId="p1-$state";source='p1-agent';sessionId='p1-session';turnId="turn-$state";status=$state;timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
            $body=$event | ConvertTo-Json -Compress
            $null=Invoke-RestMethod -Uri $connection.url -Method Post -Headers @{Authorization="Bearer $($connection.token)"} -ContentType 'application/json' -Body $body
        }
        Invoke-AgentSmoke scripts/native-p1-smoke.js
    } else { Invoke-AgentSmoke scripts/native-p0-smoke.js }
    Stop-Process -Id $app.Id
    $app.WaitForExit()
    $startOptions = @{FilePath=(Join-Path $root 'src-tauri/target/debug/desktop-pet.exe');WindowStyle='Hidden';PassThru=$true}
    if ($P1Only) { $startOptions.ArgumentList='--autostart' }
    $app=Start-Process @startOptions
    Start-Sleep -Seconds 3
    if ($EstimateOnly) { Invoke-AgentSmoke scripts/native-estimate-restart.js } elseif ($P1Only) { Invoke-AgentSmoke scripts/native-p1-restart.js } else { Invoke-AgentSmoke scripts/native-p0-restart.js }
    $saved=Get-Content -LiteralPath (Join-Path $testData 'integrations.json') -Encoding UTF8 -Raw
    if ($saved.Contains('CredentialBlob') -or $saved.Contains('session_meta')) { throw 'Unexpected raw log or secret persistence' }
    Write-Output "Native Agent checks finished. Fixture directory: $testData"
} finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id }
    if ($P1Only) {
        if ($null -ne $startupPrevious) { Set-ItemProperty -LiteralPath $startupKey -Name $startupName -Value $startupPrevious }
        else { Remove-ItemProperty -LiteralPath $startupKey -Name $startupName -ErrorAction SilentlyContinue }
    }
    npx --yes --package '@playwright/cli' playwright-cli -s=agent-native close
}
