/**
 * OpenCode server plugin (2.x plugin shape).
 *
 * Same shape as the sibling guards in this directory: default export
 * `{ id, setup }`, hooks via `ctx.tool.hook(...)`, throw = refusal whose
 * message the model reads verbatim. See forbidden-terminal-commands.ts
 * for why any other shape loads silently dead.
 *
 * Policy: a .ps1 saved through write/edit/patch must pass
 * PSScriptAnalyzer at Warning + Error + ParseError severity. Checked
 * AFTER the save, against the on-disk file: edit fragments and patch
 * hunks need no reconstruction and all three mutation tools share one
 * path. The violating file STAYS on disk (after-hooks run after the
 * mutation; opencode v2.2.5 source has no rollback on this channel —
 * see Desktop/md-library/research-misc/ps1-lint-guard-verification.md,
 * Q2.d), so the thrown message compels the agent to fix or delete it.
 *
 * Fail-open is deliberate: missing pwsh, missing PSScriptAnalyzer, a
 * spawn error or a 30 s timeout never block an otherwise valid save.
 *
 * Rules that collide with this host's documented conventions (no cmdlet
 * ceremony for session helpers; shell-integration init via
 * Invoke-Expression) are disabled host-wide via ps1-lint-settings.psd1
 * next to this file, passed to Invoke-ScriptAnalyzer as -Settings.
 * Missing settings file falls back to built-in defaults, never blocks.
 *
 * Interpreter: `pwsh` (PS7) explicitly — PSScriptAnalyzer 1.25.0 is a
 * current-user install under Documents\PowerShell\Modules, invisible to
 * Windows PowerShell 5.1, which is what the OpenCode shell tool spawns
 * on this box. pwsh auto-loads the module; no Import-Module needed.
 */

import { fileURLToPath } from "node:url";

// `patch` is a real, separate tool id on v2.2.5 and the ONLY mutation
// tool under gpt-* models (write/edit are deleted from the toolset
// there) — gating only write/edit would silently miss those sessions.
const EDIT_TOOLS = new Set(["write", "edit", "patch"]);

const LINT_BUDGET_MS = 30_000;

function getPs1Path(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  // OpenCode 1 names the path `filePath`; OpenCode 2 renamed it to `path`. Both accepted.
  for (const key of ["path", "filePath"]) {
    const value = record[key];
    if (typeof value === "string" && value.toLowerCase().endsWith(".ps1")) return value;
  }
  return null;
}

// Line/Column are PSScriptAnalyzer ScriptProperties: Select-Object them
// explicitly or ConvertTo-Json drops them. @(...) forces array JSON.
// Settings file lives beside this plugin; resolved from import.meta.url so it
// tracks the plugin directory instead of a hardcoded path. Passed via env like
// PS1_LINT_FILE. Absent or unreadable settings degrade to PSSA defaults.
const SETTINGS_URL = new URL("ps1-lint-settings.psd1", import.meta.url);
const LINT_SCRIPT = [
  "if (-not (Get-Module -ListAvailable PSScriptAnalyzer)) { exit 0 }",
  "$settings = $null; try { $settings = Get-Item -LiteralPath $env:PS1_LINT_SETTINGS -ErrorAction Stop } catch { [Console]::Error.WriteLine('ps1-lint-guard: settings unreadable, using PSSA defaults: ' + $_.Exception.Message) }",
  "$p = if ($settings) { Invoke-ScriptAnalyzer -Path $env:PS1_LINT_FILE -Settings $settings.FullName -Severity Warning,Error,ParseError } else { Invoke-ScriptAnalyzer -Path $env:PS1_LINT_FILE -Severity Warning,Error,ParseError }",
  "if ($p) { @($p | Select-Object RuleName,Severity,Line,Column,Message) | ConvertTo-Json -Compress }",
].join("; ");

const bun = (globalThis as { Bun?: { spawn: Function; version?: string } }).Bun;

// Returns formatted findings; empty array means clean OR uninspectable
// (fail-open paths are documented at each site).
async function lintPs1(filePath: string): Promise<string[]> {
  if (!bun) return []; // runtime is not Bun: cannot check, never block
  try {
    const proc = bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", LINT_SCRIPT], {
      // Path via env, never interpolated into the command: spaces and
      // quotes in Windows paths cannot break or inject it. Same for settings.
      env: { ...process.env, PS1_LINT_FILE: filePath, PS1_LINT_SETTINGS: fileURLToPath(SETTINGS_URL) },
      stdout: "pipe",
      stderr: "ignore",
      // after-hook callbacks get no AbortSignal; a hanging pwsh would
      // hang the tool fiber, so the budget is ours to enforce.
      timeout: LINT_BUDGET_MS,
    });
    const text = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    if (!text) return [];
    const records = JSON.parse(text);
    const list = Array.isArray(records) ? records : [records];
    // Severity may arrive as a number (PS enum) or a name string
    // (ConvertTo-Json behavior varies with the projection context);
    // render numbers back to names so the message stays readable.
    const SEVERITY_NAMES = ["Information", "Warning", "Error", "ParseError"];
    return list.map((r: Record<string, unknown>) => {
      const severity = typeof r.Severity === "number"
        ? (SEVERITY_NAMES[r.Severity] ?? String(r.Severity))
        : String(r.Severity);
      return `[${severity}] line ${r.Line}: ${r.RuleName} - ${r.Message}`;
    });
  } catch {
    return []; // pwsh missing or spawn failure: fail-open
  }
}

interface ToolExecuteAfterEvent {
  tool: string;
  input: unknown;
  status: string;
}

interface ToolDomainLike {
  hook: (
    name: string,
    callback: (event: ToolExecuteAfterEvent) => void | Promise<void>,
  ) => Promise<unknown>;
}

interface PluginContextLike {
  tool?: ToolDomainLike;
}

async function setup(ctx: PluginContextLike): Promise<void> {
  if (!ctx?.tool || typeof ctx.tool.hook !== "function") return;
  // Sibling plugins stay silent at load, but the after-throw channel is
  // undocumented in v2 (verified from source only): this one line makes
  // "registered, on Bun vN" a log fact instead of an inference.
  console.log(`ps1-lint-guard loaded (Bun ${bun?.version ?? "absent"})`);
  await ctx.tool.hook("execute.after", async (event) => {
    if (!event || event.status !== "completed") return;
    if (!EDIT_TOOLS.has(event.tool)) return;
    const file = getPs1Path(event.input);
    if (!file) return;
    const problems = await lintPs1(file);
    if (problems.length === 0) return;
    throw new Error(
      `[Policy Violation: ps1-lint-guard]\n`
        + `PSScriptAnalyzer found problems in '${file}':\n`
        + problems.map((p) => `  ${p}`).join("\n")
        + `\n\nThe file is already saved on disk with these problems. Remediation:\n`
        + `1. Fix the reported lines and save again, or\n`
        + `2. Suppress deliberately in the file: [Diagnostics.CodeAnalysis.SuppressMessageAttribute('RuleName', '')] followed by param() (at script top before its param block, or inside the function), or\n`
        + `3. If the rule conflicts with this host's conventions, disable it host-wide in ps1-lint-settings.psd1 beside this plugin, or\n`
        + `4. Or delete the file if it should not exist.`,
    );
  });
}

export default { id: "ps1-lint-guard", setup };
