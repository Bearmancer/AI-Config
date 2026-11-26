#Requires -Version 7.0
param(
    [switch]$Serve,
    [Parameter(Position = 0)][string]$Path
)

Import-Module PSScriptAnalyzer -ErrorAction Stop
# Load the modules that register providers (Cert:, WSMan:), so their dynamic parameters are known to the parameter check.
foreach ($m in 'Microsoft.PowerShell.Security', 'Microsoft.WSMan.Management') {
    Import-Module $m -ErrorAction Ignore
}

$script:cmdCache = @{}
$script:imported = @{}
$endMarker = "__PS1_CHECK_END__"

function Write-CheckLine {
    param([string]$Text)
    [Console]::Out.WriteLine($Text)
}

function Expand-PossiblePath {
    param([string]$Text)
    $t = $Text.Trim().Trim([char]39, [char]34)
    $t = $t.Replace('$HOME', $env:USERPROFILE).Replace('~', $env:USERPROFILE)
    $t = [regex]::Replace($t, '\$env:([A-Za-z_][A-Za-z0-9_]*)', { param($m) (Get-Item ("Env:" + $m.Groups[1].Value)).Value })
    return $t
}

function Import-DeclaredModules {
    param([System.Management.Automation.Language.Ast]$Root)
    $cmds = $Root.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)
    foreach ($c in $cmds) {
        if ($c.GetCommandName() -ne 'Import-Module') { continue }
        $els = @($c.CommandElements) | Where-Object { $_ -isnot [System.Management.Automation.Language.CommandParameterAst] }
        if ($els.Count -lt 2) { continue }
        $raw = Expand-PossiblePath -Text $els[1].Extent.Text
        if ($script:imported.ContainsKey($raw)) { continue }
        $script:imported[$raw] = $true
        $isFile = $raw -match '\\' -or $raw -match '/'
        try {
            if ($isFile) {
                if (Test-Path -LiteralPath $raw) {
                    Import-Module $raw -Global -ErrorAction Stop
                }
            }
            elseif (Get-Module -ListAvailable -Name $raw) {
                Import-Module -Name $raw -Global -ErrorAction Stop
            }
        }
        catch {
        }
    }
}

$script:paramCache = @{}
$script:paramOwner = @{}

# Parameter names and aliases a command accepts, or $null when it can't be known
# (applications, scripts, simple functions without [CmdletBinding()], dynamic-param providers).
function Get-ParameterTable {
    param([string]$Name)
    if ($script:paramCache.ContainsKey($Name)) { return $script:paramCache[$Name] }
    $table = $null
    $cmd = Get-Command -Name $Name -ErrorAction Ignore | Select-Object -First 1
    while ($cmd -is [System.Management.Automation.AliasInfo]) { $cmd = $cmd.ResolvedCommand }
    $checkable = $cmd -is [System.Management.Automation.CmdletInfo] -or
        ($cmd -is [System.Management.Automation.FunctionInfo] -and $cmd.CmdletBinding)
    if ($checkable -and $cmd.Parameters) {
        $owner = @{}
        $sets = @($cmd.Parameters.Values)
        # Provider cmdlets (Get-ChildItem, New-Item, ...) add dynamic parameters per drive: take the union over one drive per provider.
        if ($cmd -is [System.Management.Automation.CmdletInfo] -and
            [System.Management.Automation.IDynamicParameters].IsAssignableFrom($cmd.ImplementingType)) {
            foreach ($prov in Get-PSProvider) {
                $drive = $prov.Drives | Select-Object -First 1
                if (-not $drive) { continue }
                $dyn = $null
                # Cmdlets that take no positional path throw a binding error here; they have no per-drive parameters.
                try { $dyn = Get-Command -Name $cmd.Name -ArgumentList "$($drive.Name):\" -ErrorAction Stop | Select-Object -First 1 } catch { $dyn = $null }
                if ($dyn -and $dyn.Parameters) { $sets += @($dyn.Parameters.Values) }
            }
        }
        foreach ($p in $sets) {
            $owner[$p.Name] = $p.Name
            foreach ($a in $p.Aliases) { $owner[$a] = $p.Name }
        }
        $script:paramOwner[$Name] = $owner
        $table = [string[]]@($owner.Keys)
    }
    $script:paramCache[$Name] = $table
    return $table
}

function Get-FileIssue {
    param([string]$File)

    if (-not (Test-Path -LiteralPath $File)) {
        Write-Output "file not found: $File"
        return
    }

    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($File, [ref]$tokens, [ref]$parseErrors)
    foreach ($e in @($parseErrors)) {
        Write-Output "parse L$($e.Extent.StartLineNumber): $($e.Message.Trim())"
    }

    try {
        foreach ($r in @(Invoke-ScriptAnalyzer -Path $File -ErrorAction Stop | Where-Object Severity -eq 'Error')) {
            Write-Output "analyzer L$($r.Line): $($r.RuleName) :: $($r.Message.Trim())"
        }
    }
    catch {
        Write-Output "analyzer failed: $($_.Exception.Message)"
    }

    if (@($parseErrors).Count -gt 0) { return }

    Import-DeclaredModules -Root $ast

    $funcs = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object Name)
    foreach ($c in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)) {
        if ($c.IsKeyword) { continue }
        $name = $c.GetCommandName()
        if ([string]::IsNullOrEmpty($name)) { continue }
        if ($funcs -contains $name) { continue }
        if ($script:cmdCache.ContainsKey($name)) {
            if (-not $script:cmdCache[$name]) {
                Write-Output "unresolved command L$($c.Extent.StartLineNumber): $name"
            }
            continue
        }
        $resolved = Get-Command -Name $name -ErrorAction Ignore | Select-Object -First 1
        $found = $null -ne $resolved
        $script:cmdCache[$name] = $found
        if (-not $found) {
            Write-Output "unresolved command L$($c.Extent.StartLineNumber): $name"
        }
    }

    foreach ($c in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)) {
        $name = $c.GetCommandName()
        if ([string]::IsNullOrEmpty($name) -or $funcs -contains $name) { continue }
        $info = Get-ParameterTable -Name $name
        if ($null -eq $info) { continue }
        foreach ($p in @($c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.CommandParameterAst] })) {
            $pn = $p.ParameterName
            if ([string]::IsNullOrEmpty($pn)) { continue }
            $hits = @($info | Where-Object { $_ -like "$pn*" })
            if ($hits -contains $pn) { continue }
            if ($hits.Count -eq 0) {
                Write-Output "unknown parameter L$($p.Extent.StartLineNumber): -$pn for $name"
            }
            elseif ($hits.Count -gt 1) {
                $full = @($script:paramOwner[$name].GetEnumerator() | Where-Object { $hits -contains $_.Key } | ForEach-Object Value | Select-Object -Unique)
                if ($full.Count -gt 1) {
                    Write-Output "ambiguous parameter L$($p.Extent.StartLineNumber): -$pn for $name matches $($full -join ', ')"
                }
            }
        }
    }

    foreach ($s in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] }, $true)) {
        $v = $s.Value
        if ($v -notmatch '^(?:[A-Za-z]:\\|\\\\[A-Za-z0-9._-]+\\|[A-Za-z][A-Za-z0-9_]+:\\)') { continue }
        if ($v.Length -lt 3) { continue }
        # Wildcards and regex syntax are patterns, not paths.
        if ($v -match '[*?|()\[\]^$]') { continue }
        $exists = $true
        try { $exists = Test-Path -LiteralPath $v } catch { $exists = $true }
        if (-not $exists) {
            Write-Output "dead path L$($s.Extent.StartLineNumber): $v"
        }
    }
}

if ($Serve) {
    while ($true) {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) { break }
        if ([string]::IsNullOrWhiteSpace($line)) {
            Write-CheckLine $endMarker
            [Console]::Out.Flush()
            continue
        }
        foreach ($issue in @(Get-FileIssue -File $line.Trim())) {
            Write-CheckLine $issue
        }
        Write-CheckLine $endMarker
        [Console]::Out.Flush()
    }
}
else {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        Write-Error 'usage: ps1-check.ps1 [-Serve] [Path]'
        exit 2
    }
    $issues = @(Get-FileIssue -File $Path)
    foreach ($issue in $issues) {
        Write-CheckLine $issue
    }
    if ($issues.Count -gt 0) {
        exit 1
    }
    exit 0
}


