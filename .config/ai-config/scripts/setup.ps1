#Requires -Version 7.5
<#
.SYNOPSIS
One-shot per-PC setup: puts the AI-Config repo in place at $HOME and wires the apps.

.DESCRIPTION
1. Clones <Remote> with --no-checkout into ~/Dev/AI-Config (the git dir) and points
   core.worktree at $HOME, so the repo tracks the live config files in place.
2. Saves `git diff` of the live files against the repo to a report, then runs
   `git checkout -f main`.
3. Sets user environment variables for every secret the MCP set references,
   from `bws secret list` (values are never printed).
4. Restores skills with `npx skills experimental_install` run from $HOME. That
   command installs only to universal agents (.agents/skills), so it then runs
   `npx skills add <source> -s <name> -a claude-code -y` for each lock skill (one name
   per call; multi-name -s fails on some sources) to fill ~/.claude/skills.
5. Writes the OpenCode MCP server set into the app-owned Cline and Claude files:
   Cline holds every server with all but the harnesses.toml [shared] enabled_servers
   set to disabled; Claude holds only the enabled servers.

Run once per PC. Needs git, bws, npx and BWS_ACCESS_TOKEN.

.PARAMETER Remote
Git remote URL of the AI-Config repo.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Remote,
    [string]$Branch = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo = Join-Path $HOME 'Dev/AI-Config'
$ConfigDir = Join-Path $HOME '.config/ai-config'
$Report = Join-Path $Repo 'live-vs-repo.diff'
$OpenCodeConfig = Join-Path $HOME '.config/opencode/opencode.jsonc'
$ClineMcp = Join-Path $HOME '.cline/data/settings/cline_mcp_settings.json'
$ClaudeJson = Join-Path $HOME '.claude.json'
$HarnessesToml = Join-Path $ConfigDir 'harnesses.toml'
# bws prefix for an MCP env var is the var minus _API_KEY, unless listed here (prefix -> bws prefix).
$PrefixAlias = @{ SGAI = 'SCRAPEGRAPHAI' }
$EnvRef = '\{env:([A-Za-z_][A-Za-z0-9_]*)\}'

function Invoke-Native {
    param([string]$What, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE" }
}

function Write-JsonFile {
    param([string]$Path, $Value)
    $dir = Split-Path $Path -Parent
    New-Item -ItemType Directory -Force $dir | Out-Null
    $tmp = "$Path.tmp"
    [IO.File]::WriteAllText($tmp, ($Value | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
    Move-Item -Force $tmp $Path
}

function Read-JsonObject {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return [pscustomobject]@{} }
    Get-Content -Raw $Path | ConvertFrom-Json -DateKind String
}

function Resolve-Secret {
    param([string]$Var, [object[]]$Secrets)
    $exact = $Secrets | Where-Object { $_.key -ceq $Var } | Select-Object -First 1
    if ($exact) { return $exact }
    $prefix = $Var -replace '_API_KEY$', ''
    if ($PrefixAlias.ContainsKey($prefix)) { $prefix = $PrefixAlias[$prefix] }
    $Secrets |
        Where-Object { $_.key -ceq $prefix -or $_.key.StartsWith("${prefix}_", [StringComparison]::Ordinal) } |
        Sort-Object { $_.key } |
        Select-Object -First 1
}

function ConvertTo-McpEntry {
    param($Server, [string]$EnvTemplate, [bool]$Typed)
    $command = @($Server.command)
    $entry = [ordered]@{}
    if ($Typed) { $entry.type = 'stdio' }
    $entry.command = $command[0]
    $rest = [object[]]@()
    if ($command.Count -gt 1) { $rest = [object[]]$command[1..($command.Count - 1)] }
    $entry.args = $rest
    $environment = $Server.PSObject.Properties['environment']
    if ($environment) {
        $envMap = [ordered]@{}
        foreach ($p in $environment.Value.PSObject.Properties) {
            $envMap[$p.Name] = [regex]::Replace([string]$p.Value, $EnvRef, { param($m) $EnvTemplate.Replace('VAR', $m.Groups[1].Value) })
        }
        $entry.env = $envMap
    }
    $entry
}

function Set-McpServers {
    param([string]$Path, [string]$Label, [string]$EnvTemplate, [bool]$Typed, [bool]$KeepDisabled, $Servers, [string[]]$Enabled)
    $doc = Read-JsonObject $Path
    if (-not $doc.PSObject.Properties['mcpServers'] -or $null -eq $doc.mcpServers) {
        $doc | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    foreach ($server in $Servers.PSObject.Properties) {
        if ($Enabled -contains $server.Name) {
            $entry = ConvertTo-McpEntry $server.Value $EnvTemplate $Typed
            $doc.mcpServers | Add-Member -NotePropertyName $server.Name -NotePropertyValue $entry -Force
        }
        elseif ($KeepDisabled) {
            $entry = ConvertTo-McpEntry $server.Value $EnvTemplate $Typed
            $entry.disabled = $true
            $doc.mcpServers | Add-Member -NotePropertyName $server.Name -NotePropertyValue $entry -Force
        }
        else { $doc.mcpServers.PSObject.Properties.Remove($server.Name) }
    }
    Write-JsonFile $Path $doc
    Write-Host "${Label}: wrote $(@($doc.mcpServers.PSObject.Properties).Count) MCP servers to $Path (enabled: $($Enabled -join ', '))"
}

# 0. Preconditions.
foreach ($tool in 'git', 'bws', 'npx') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not on PATH" }
}
if (-not $env:BWS_ACCESS_TOKEN) {
    $env:BWS_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable('BWS_ACCESS_TOKEN', 'User')
}
if (-not $env:BWS_ACCESS_TOKEN) { throw 'BWS_ACCESS_TOKEN is not set (process or user environment)' }
if (Test-Path (Join-Path $Repo '.git')) { throw "$Repo already exists; setup is one-shot" }

# 1. Clone without a checkout and point the worktree at $HOME.
Invoke-Native 'git clone' { git clone --no-checkout --branch $Branch -- $Remote $Repo }
Invoke-Native 'git config core.worktree' { git -C $Repo config core.worktree $HOME }
Invoke-Native 'git config status.showUntrackedFiles' { git -C $Repo config status.showUntrackedFiles no }
Invoke-Native 'git config core.hooksPath' { git -C $Repo config core.hooksPath (Join-Path $ConfigDir 'hooks') }

# 2. Report how the live files differ from the repo, then take the repo's version.
Invoke-Native 'git read-tree' { git -C $Repo read-tree HEAD }
$diff = git -C $Repo diff
if ($LASTEXITCODE -ne 0) { throw "git diff failed with exit code $LASTEXITCODE" }
[IO.File]::WriteAllText($Report, (($diff -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
Write-Host "Live-file diff saved to $Report (it may contain secrets; delete it after review)."
Invoke-Native 'git checkout' { git -C $Repo checkout -f --end-of-options $Branch }

# 3. User environment variables for the secrets the MCP set references.
$opencode = Get-Content -Raw $OpenCodeConfig | ConvertFrom-Json
$servers = $opencode.mcp.servers
$vars = @(
    foreach ($server in $servers.PSObject.Properties) {
        $environment = $server.Value.PSObject.Properties['environment']
        if ($environment) {
            foreach ($p in $environment.Value.PSObject.Properties) {
                foreach ($m in [regex]::Matches([string]$p.Value, $EnvRef)) { $m.Groups[1].Value }
            }
        }
    }
) | Sort-Object -Unique
$listing = bws secret list
if ($LASTEXITCODE -ne 0) { throw "bws secret list failed with exit code $LASTEXITCODE" }
$secrets = @(($listing -join "`n") | ConvertFrom-Json)
$missing = @()
foreach ($var in $vars) {
    $secret = Resolve-Secret $var $secrets
    if (-not $secret) { $missing += $var; continue }
    [Environment]::SetEnvironmentVariable($var, $secret.value, 'User')
    Set-Item -Path "Env:$var" -Value $secret.value
    Write-Host "env: set $var"
}
if ($missing) { Write-Warning "no bws secret found for: $($missing -join ', ')" }

# 4. Skills: restore from ~/skills-lock.json into ~/.agents/skills (4-25 minutes, needs GitHub),
# then add every lock skill for Claude Code, one `add` per lock source.
# computedHash is a sha256 over the raw bytes of a fresh `git clone` of the source, so a
# CRLF checkout changes it: Git for Windows ships core.autocrlf=true, and even with it off a
# text=auto repo (firecrawl/skills) is checked out with native CRLF unless core.eol=lf. These
# env vars set both for the npx processes only; no git config file is touched.
$env:GIT_CONFIG_COUNT = '2'
$env:GIT_CONFIG_KEY_0 = 'core.autocrlf'
$env:GIT_CONFIG_VALUE_0 = 'false'
$env:GIT_CONFIG_KEY_1 = 'core.eol'
$env:GIT_CONFIG_VALUE_1 = 'lf'
Push-Location $HOME
try {
    Invoke-Native 'npx skills experimental_install' { npx --yes skills experimental_install }
    $lock = Get-Content -Raw (Join-Path $HOME 'skills-lock.json') | ConvertFrom-Json
    foreach ($skill in $lock.skills.PSObject.Properties) {
        $source = $skill.Value.source
        $name = $skill.Name
        # The skills CLI has no `--` separator, so a value that could read as an option is refused.
        if ($name.StartsWith('-') -or $source.StartsWith('-')) { throw "skills-lock.json: refusing option-like source or name for '$name'" }
        Invoke-Native "npx skills add $source -s $name" { npx --yes skills add $source -s $name -a claude-code -y }
    }
}
finally {
    Pop-Location
    Remove-Item Env:GIT_CONFIG_COUNT, Env:GIT_CONFIG_KEY_0, Env:GIT_CONFIG_VALUE_0, Env:GIT_CONFIG_KEY_1, Env:GIT_CONFIG_VALUE_1
}

# 5. MCP entries for the apps whose files are not tracked.
$enabled = @(python -c "import tomllib,sys;print('\n'.join(tomllib.load(open(sys.argv[1],'rb'))['shared']['enabled_servers']))" $HarnessesToml)
if ($LASTEXITCODE -ne 0 -or -not $enabled) { throw "cannot read [shared] enabled_servers from $HarnessesToml" }
Set-McpServers $ClineMcp 'cline' '${env:VAR}' $false $true $servers $enabled
Set-McpServers $ClaudeJson 'claude' '${VAR}' $true $false $servers $enabled

if ($missing) { exit 1 }
Write-Host 'setup complete. Restart apps and shells to pick up the new environment variables.'
