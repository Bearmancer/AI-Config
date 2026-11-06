/**
 * OpenCode server plugin (2.x plugin shape — see forbidden-terminal-commands.ts
 * header for why the default export must be a plain { id, setup } object).
 *
 * Problem class isolated 2026-11-05: `tvly` (uv-tool Python shim in
 * ~/.local\bin) dies mid-print with
 *   UnicodeEncodeError: 'charmap' codec can't encode character '\u2117'
 *   ... cp1252.py ... click.echo -> file.write
 * exit 1, whenever a Tavily result snippet contains a character outside
 * Windows-1252 (℗ is common in label/catalog text). Root cause: CPython
 * 3.12 with PYTHONIOENCODING unset encodes stdout using the ANSI locale
 * codepage (cp1252, strict errors) — the console CP 437 is irrelevant.
 * Control probe pair: same query crashes bare, exits 0 with
 * `$env:PYTHONIOENCODING='utf-8'; ` prepended.
 *
 * Fix: in execute.before, rewrite shell commands that invoke a known
 * Python shim without already setting PYTHONIOENCODING, prepending the
 * env assignment. If 2.x hooks receive a copy of the input (rewrite is a
 * no-op), the fallback is the throwing variant below — kept behind
 * STRICT=false so the behavior is one constant away.
 */

interface PythonUtf8Options {
  /** Shells are Windows PowerShell: prepend a pwsh env assignment. */
  prefix: string;
  /** Bare names of Python-based CLI shims that print non-ASCII to stdout. */
  shims: string[];
  /**
   * When true, refuse (throw) commands that would crash instead of
   * rewriting them, with the exact prefix to retry with. Used if input
   * mutation turns out not to propagate.
   */
  strict: boolean;
}

const OPTIONS: PythonUtf8Options = {
  prefix: "$env:PYTHONIOENCODING='utf-8'; ",
  shims: ["tvly"],
  strict: false,
};

function invokesPythonShim(cmd: string, shims: string[]): boolean {
  for (const shim of shims) {
    // Statement start (line start, after ; | & separators, or after & call
    // operator), optional quoted/qualified path, then the shim name.
    const re = new RegExp(
      `(?:^|[;&|\\n])\\s*(?:&\\s*)?(?:"[^"\\n]*[\\\\/]${shim}(?:\\.exe)?"|'[^'\\n]*[\\\\/]${shim}(?:\\.exe)?'|(?:[^\\s"';&|]+[\\\\/])?${shim}(?:\\.exe)?)(?=\\s|$)`,
      "i",
    );
    if (re.test(cmd)) return true;
  }
  return false;
}

interface ToolExecuteBeforeEvent {
  tool: string;
  input: unknown;
}

async function setup(
  ctx: {
    tool?: { hook: (name: string, cb: (event: ToolExecuteBeforeEvent) => void | Promise<void>) => Promise<unknown> };
  },
): Promise<void> {
  if (!ctx?.tool || typeof ctx.tool.hook !== "function") return;
  await ctx.tool.hook("execute.before", (event) => {
    if (!event || event.tool !== "shell") return;
    if (!event.input || typeof event.input !== "object") return;
    const record = event.input as Record<string, unknown>;
    const cmd = typeof record.command === "string" ? record.command : typeof record.cmd === "string" ? record.cmd : "";
    if (!cmd) return;
    if (/PYTHONIOENCODING/i.test(cmd)) return; // already handled by the caller
    if (!invokesPythonShim(cmd, OPTIONS.shims)) return;

    if (OPTIONS.strict) {
      throw new Error(
        `[Policy: python-cli-utf8] This command runs a Python CLI shim whose stdout defaults to cp1252; non-ASCII results crash it (UnicodeEncodeError). Retry with the prefix: ${OPTIONS.prefix}${cmd}`,
      );
    }
    if (typeof record.command === "string") record.command = OPTIONS.prefix + cmd;
    else if (typeof record.cmd === "string") record.cmd = OPTIONS.prefix + cmd;
  });
}

export default { id: "python-cli-utf8", setup };
