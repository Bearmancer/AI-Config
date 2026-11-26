Remove-Alias ls
New-Alias ls eza
New-Alias oc opencode

function la {
	eza -la @args
}

Remove-Alias rm
function rm {
	coreutils rm @args
}

. ([scriptblock]::Create((zoxide init powershell) -join "`n"))


#region eza ls (added 2026-11-20)
if (Get-Command eza -ErrorAction SilentlyContinue) {
    Remove-Item Alias:ls -Force -ErrorAction SilentlyContinue
    function ls { eza @args }
    function la { eza -la @args }
}
#endregion


#region history dropdown (added 2026-11-20)
if (-not [Console]::IsOutputRedirected) { Set-PSReadLineOption -PredictionSource History -PredictionViewStyle ListView -HistoryNoDuplicates }
Set-PSReadLineKeyHandler -Key Ctrl+r -Function ReverseSearchHistory
#endregion
#region ctrlr fzf menu (added 2026-11-20)
if (Get-Command fzf -ErrorAction SilentlyContinue) {
    Set-PSReadLineKeyHandler -Key Ctrl+r -ScriptBlock {
        param($key, $arg)
        $line = $null; $cursor = $null
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
        $sel = Get-Content (Get-PSReadLineOption).HistorySavePath | fzf --tac --scheme=history --height=40% --reverse --query="$line" --prompt='history> '
        if ($sel) {
            [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
            [Microsoft.PowerShell.PSConsoleReadLine]::Insert($sel)
        }
    }
}
#endregion

#region token-plan usage (added 2026-11-20)
function Get-AlibabaTokenUsage {
  "$([math]::Round((bailian usage token-plan --output json | ConvertFrom-Json).per1MonthPercentage*100,1))% used"
}
#endregion

#region azure monthly cost (added 2026-11-26) - cmdlets only, no az CLI, no py
function azcost {
  # Billed this month: meter / resource. -Month yyyy-MM, -Trend = 6 months, -Daily = per day.
  param([string]$Month, [switch]$Trend, [switch]$Daily)
  $b = @{ type = 'ActualCost'; timeframe = 'MonthToDate'; dataset = @{ granularity = 'None'; aggregation = @{ cost = @{ name = 'PreTaxCost'; function = 'Sum' } }; grouping = @(@{ type = 'Dimension'; name = 'ResourceId' }, @{ type = 'Dimension'; name = 'Meter' }) } }
  if ($Month) { $d = [datetime]::ParseExact($Month, 'yyyy-MM', $null); $b.timeframe = 'Custom'; $b.timePeriod = @{ from = $d.ToString('yyyy-MM-01T00:00:00Z'); to = $d.AddMonths(1).ToString('yyyy-MM-01T00:00:00Z') } }
  if ($Trend) { $b.timeframe = 'Custom'; $b.timePeriod = @{ from = (Get-Date -Day 1).AddMonths(-5).ToString('yyyy-MM-01T00:00:00Z'); to = (Get-Date).AddDays(1).ToString('yyyy-MM-ddT00:00:00Z') }; $b.dataset.granularity = 'Monthly' }
  if ($Daily) { $b.dataset.granularity = 'Daily' }
  $p = ((Invoke-AzRestMethod -Method POST -Payload ($b | ConvertTo-Json -Depth 8) -Path ('subscriptions/' + (Get-AzContext).Subscription.Id + '/providers/Microsoft.CostManagement/query?api-version=2023-08-01')).Content | ConvertFrom-Json).properties
  $c = $p.columns.name; $i = $c.IndexOf('PreTaxCost'); $m = $c.IndexOf('Meter'); $r = $c.IndexOf('ResourceId'); $dt = $c.IndexOf('BillingMonth'); $u = $c.IndexOf('UsageDate')
  $t = 0
  foreach ($x in $p.rows | Sort-Object { $_[$i] } -Descending) {
    if ($x[$i] -le 0) { continue }
    $pre = $dt -ge 0 ? (Get-Date $x[$dt] -Format 'yyyy-MM') + ' ' : $u -ge 0 ? "$($x[$u]) " : ''
    $t += [double]$x[$i]
    '₹{0:N5} {1}{2} / {3}' -f $x[$i], $pre, $x[$m], $x[$r].Trim('/').Split('/')[-1]
  }
  '₹{0:N5} TOTAL' -f $t
}
Set-Alias Get-AzureCost azcost -Force
#endregion
