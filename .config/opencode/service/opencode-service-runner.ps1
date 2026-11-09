# OpenCode Tailnet pin supervision runner (5.1-compatible)
# Purpose: keep a pinned `opencode serve --hostname 127.0.0.1 --port 28894 --service`
# registered and healthy. Newest-wins registration semantics heal handovers.
# Secrets policy: never read/print credential values here.
# Manages: opencode.exe spawned as a hidden child; external port holders get a 120 s
# grace before a single controlled stop+respawn; registry drift with our child alive
# is tolerated (URL keeps working) and only logged.

$ErrorActionPreference = 'Continue'
$PinPort  = 28894
$PinUrl   = 'http://127.0.0.1:28894'
$RegPath  = 'C:\Users\Lance\.local\state\opencode\service.json'
$LogPath  = 'C:\Users\Lance\.local\state\opencode\service-runner.log'
$Exe      = 'C:\Users\Lance\.bun\bin\opencode.exe'
$SpawnArgs = 'serve --hostname 127.0.0.1 --port 28894 --service'

function Write-RunnerLog([string]$m) {
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $m
    Add-Content -Path $LogPath -Value $line
    try {
        if ((Get-Item $LogPath -ErrorAction Stop).Length -gt 5MB) {
            Move-Item -Path $LogPath -Destination ($LogPath + '.1') -Force
        }
    } catch {
        Write-Verbose ('rotation check skipped: ' + $_.Exception.Message)
    }
}

function Get-RegistryState {
    try {
        return Get-Content -Path $RegPath -Raw -ErrorAction Stop | ConvertFrom-Json
    } catch {
        Write-Verbose ('registry read skipped: ' + $_.Exception.Message)
        return $null
    }
}

function Get-PortHolder {
    $c = Get-NetTCPConnection -LocalPort $PinPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess } else { return 0 }
}

Write-RunnerLog 'runner started'
$child = $null
$failCount = 0
$driftSince = $null
$driftLogged = $false

while ($true) {
    $reg = Get-RegistryState
    $regOk = ($null -ne $reg) -and ($reg.url -eq $PinUrl) -and ($null -ne (Get-Process -Id $reg.pid -ErrorAction SilentlyContinue))

    if ($regOk) {
        $child = $null
        $driftSince = $null
        $driftLogged = $false
        Start-Sleep -Seconds 15
        continue
    }

    $childAlive = ($null -ne $child) -and (-not $child.HasExited)
    $holder = Get-PortHolder

    if ($holder -gt 0 -and $childAlive) {
        if (-not $driftLogged) {
            Write-RunnerLog ("registry drifted (url='{0}' pid={1}) but our child keeps serving the pin on port {2}" -f $reg.url, $reg.pid, $PinPort)
            $driftLogged = $true
        }
        Start-Sleep -Seconds 15
        continue
    }

    if ($holder -gt 0 -and (-not $childAlive)) {
        if ($null -ne $child -and $holder -eq $child.Id) { Start-Sleep -Seconds 2; continue }
        if ($null -eq $driftSince) {
            $driftSince = Get-Date
            Write-RunnerLog ("pin port held by external pid {0} (registry url='{1}'); grace 120 s" -f $holder, $reg.url)
        }
        $held = [int]((Get-Date) - $driftSince).TotalSeconds
        if ($held -lt 120) { Start-Sleep -Seconds 10; continue }
        Write-RunnerLog ("re-asserting pin: stopping non-owner pid {0} holding port {1}" -f $holder, $PinPort)
        Stop-Process -Id $holder -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    Write-RunnerLog ("spawning pinned serve on port {0}..." -f $PinPort)
    $outLog = 'C:\Users\Lance\.local\state\opencode\service-child.out.log'
    $errLog = 'C:\Users\Lance\.local\state\opencode\service-child.err.log'
    try {
        $child = Start-Process -FilePath $Exe -ArgumentList $SpawnArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog -ErrorAction Stop
        Write-RunnerLog ("spawned pid {0}" -f $child.Id)
    } catch {
        Write-RunnerLog ("spawn failed: {0}" -f $_.Exception.Message)
        $child = $null
    }
    $driftSince = $null
    $driftLogged = $false

    if ($null -ne $child) {
        while (-not $child.HasExited) {
            Start-Sleep -Seconds 10
            $r2 = Get-RegistryState
            if ($null -ne $r2) {
                if ($r2.url -eq $PinUrl) { break }   # pin won; outer loop owns steady state
                if (-not (Get-PortHolder)) {
                    Write-RunnerLog ("registry drifted to url='{0}' pid={1}; pin port now unserved; re-asserting" -f $r2.url, $r2.pid)
                    break
                }
            }
        }
        if ($child.HasExited) {
            $failCount = $failCount + 1
            Write-RunnerLog ("opencode serve exited code {0} ({1} recent failures)" -f $child.ExitCode, $failCount)
            $errTail = @(Get-Content $errLog -Tail 12 -ErrorAction SilentlyContinue) -join ' | '
            if ($errTail) { Write-RunnerLog ('child stderr tail: ' + $errTail) }
            if ($failCount -ge 5) {
                Write-RunnerLog 'storm breaker: cooling down 60 s'
                Start-Sleep -Seconds 60
                $failCount = 0
            }
        }
    }
    Start-Sleep -Seconds 5
}
