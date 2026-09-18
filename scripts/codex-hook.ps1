param([string]$DiscoveryFile)
$ErrorActionPreference = 'Stop'
# Only forward identifiers and lifecycle state. Never forward prompts, tool arguments,
# permission decisions, credentials or transcript content. A notification must not block an Agent.
try {
    $raw = [Console]::In.ReadToEnd()
    if ($raw.Length -le 1048576) {
        $hook = $raw | ConvertFrom-Json
        $status = switch ($hook.hook_event_name) {
            'UserPromptSubmit' { 'running' }
            'PermissionRequest' { 'waiting' }
            'Stop' { 'completed' }
            'Interrupt' { 'interrupted' }
            default { $null }
        }
        if ($status -and $hook.session_id) {
            # A hook that omits turn_id gets a session-level entry; it is not falsely
            # attached to a guessed Codex turn or used for token accounting.
            $turn = if ($hook.turn_id) { [string]$hook.turn_id } else { 'hook-session' }
            $params = @{Source='codex';SessionId=[string]$hook.session_id;TurnId=$turn;Status=$status;Quiet=$true}
            if ($DiscoveryFile) { $params.DiscoveryFile=$DiscoveryFile }
            & (Join-Path $PSScriptRoot 'send-agent-event.ps1') @params
        }
    }
} catch { }
# An empty JSON object leaves all permission and stop decisions to Codex.
Write-Output '{}'
exit 0
