// The one Python guard: pathlib discipline, no PEP 723 headers, uv-only CLI, tvly UTF-8 shim.
import { readFileSync } from "node:fs";

const NO_VENV = "`uv venv`/`virtualenv` is forbidden. No venvs on this box: `uv run <file.py>` with libraries from `uv pip install`.";
const BANNED: Record<string, string> = {
  venv: NO_VENV,
  virtualenv: NO_VENV,
  add: "`uv add` is forbidden. It writes pyproject.toml/uv.lock, and a pyproject makes `uv run` build a .venv and hide the shared libraries. Use `uv pip install <pkg>`.",
  sync: "`uv sync` is forbidden: no pyproject.toml, no uv.lock, no project env. Use `uv pip install <pkg>`.",
  lock: "`uv lock` is forbidden: no lockfiles on this box. Use `uv pip install <pkg>`.",
  init: "`uv init` is forbidden: no pyproject.toml, ever. A script is a .py file run with `uv run <file.py>`.",
  tool: "`uv tool` allows only install, list, upgrade and uninstall: install the tool once, then call it by name.",
};
const INTERPRETERS = /^(?:.*[\\\/])?(?:python[\d._]*|pypy[\d._]*|py)(?:\.exe)?$/;
const PIPS = /^(?:.*[\\\/])?(?:pip[\d._]*|pipx)(?:\.exe)?$/;
const UVS = /^(?:.*[\\\/])?(?:uv|uvx|virtualenv)(?:\.exe)?$/;
const unq = (w: string) => w.replace(/^["']|["']$/g, "");
const HEADER = /^[ \t]*#[ \t]*\/\/\/[ \t]*(?:script|dependencies|requires-python|tool)[ \t]*$/im;
const OPS = /(?:\b(?:open\s*\(|os\.path\b|os\.listdir\b|os\.walk\b|os\.mkdir\b|os\.makedirs\b|os\.remove\b|os\.unlink\b|shutil\b))/;
const HAS_PATHLIB = /(?:from\s+pathlib\s+import|\bimport\s+pathlib\b)/;
const BARE_OPEN = /(?<!\.)\bopen\s*\(/;
const SHIM = /(?:^|[;&|\n])\s*(?:&\s*)?(?:"[^"\n]*[\\/]tvly(?:\.exe)?"|'[^'\n]*[\\/]tvly(?:\.exe)?'|(?:[^\s"';&|]+[\\/])?tvly(?:\.exe)?)(?=\s|$)/i;
const FIX_PATHLIB = `\n\nRemediation:\n1. Import Path: from pathlib import Path\n2. Read files: Path(p).read_text(encoding="utf-8")\n3. Write files: Path(p).write_text(content, encoding="utf-8")\n4. Paths: Use Path(r'C:\\...') or forward slashes Path('C:/...')`;
const FIX_OPEN = `\n\nRemediation:\n1. Import Path: from pathlib import Path\n2. Read files: Path(p).read_text(encoding="utf-8")\n3. Or stream: Path(p).open("r", encoding="utf-8")`;
const RUN_PY_MSG = "[Policy Violation: uv-run-script]\n`uv run ... python <file.py>` is blocked. Run `uv run <file.py> <args>`, with no uv flags; a script's libraries come from `uv pip install <pkg>`.";
const HEADER_MSG = "[Policy Violation: uv-run-script]\nA PEP 723 `# /// script` header is banned here: uv gives a headered script a sealed env, so packages from `uv pip install` are invisible to it. Delete the header and run `uv run <file.py>`; name the dependency in a `uv pip install <pkg>` line in the docstring or skill doc instead.";

/** Statements of a command, top level plus the body of any `sh -c`. */
function split(cmd: string): string[] {
  cmd = cmd.trim();
  const top: string[] = [];
  let cur = "", dq = false, sq = false;
  const push = () => { if (cur.trim()) top.push(cur.trim()); cur = ""; };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === '"' && !sq) dq = !dq;
    else if (ch === "'" && !dq) sq = !sq;
    else if (!dq && !sq && (ch === ";" || ch === "\n" || (ch === "&" && cmd[i + 1] === "&") || (ch === "|" && cmd[i + 1] === "|"))) { push(); if (ch === "&" || ch === "|") i++; continue; }
    else if (!dq && !sq && ch === "|") { push(); continue; }
    cur += ch;
  }
  push();
  const out: string[] = [];
  for (const s of top) {
    out.push(s);
    const w = s.match(/^(?:\S*[\\\/])?(?:(?:ba|da|z|k)?sh(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)\s+(?:-\S+\s+)*?(?:-command|-c|-\w*c\w*)\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*$/i);
    if (w) out.push(...split(w[1] ?? w[2] ?? ""));
  }
  return out;
}

function violation(stmt: string): string | null {
  const m = stmt.match(/^\s*(?:(?:call|start|exec|&)\s+)?(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))\s*(.*)$/i);
  if (!m) return null;
  const b = (m[1] || m[2] || m[3] || "").toLowerCase();
  const words = (m[4] || "").trim().split(/\s+/).filter(Boolean);
  const sub = (words[0] || "").toLowerCase();
  if (INTERPRETERS.test(b)) return b === "py" || b === "py.exe" ? "`py` is forbidden (it resolves to a python.org install, not the one `uv run` uses). Use `uv run <file.py> <args>`." : `Direct '${b}' is forbidden. Use uv only: 'uv run ./script.py <args>' with no flags.`;
  if (PIPS.test(b)) return `Direct '${b}' is forbidden. Use 'uv pip install <pkg>' for libraries and 'uv tool install <pkg>' for tools.`;
  if (!UVS.test(b)) return null;
  if (/^virtualenv(?:\.exe)?$/.test(b) || sub === "venv" || sub === "virtualenv") return NO_VENV;
  if (/(?:^|[\\\/])uvx(?:\.exe)?$/.test(b) || sub === "tool" && words[1]?.toLowerCase() === "run") return "`uvx`/`uv tool run` is not used: `uv tool install <pkg>` once, then call the tool by name.";
  if (BANNED[sub] && !(sub === "tool" && /^(install|list|upgrade|uninstall)$/i.test(words[1] ?? ""))) return BANNED[sub];
  if (sub === "run") {
    for (const w of words.slice(1)) {
      if (!w.startsWith("-")) {
        if (INTERPRETERS.test(unq(w))) return RUN_PY_MSG;
        if (!/\.py$/i.test(unq(w))) return `\`uv run\` takes a .py file as its first argument: got '${w}'.`;
        return null;
      }
      return `\`uv run\` takes no flags: '${w}'. Libraries come from \`uv pip install <pkg>\`, the version from ~\\.python-version (3.13), and a script needs no header. Run \`uv run <file.py> <args>\`.`;
    }
    return "`uv run` needs a .py file: `uv run <file.py> <args>`.";
  }
  return null;
}

function inspect(tool: string, input: unknown): void {
  if (!input || typeof input !== "object") return;
  const r = input as Record<string, unknown>;
  if (tool === "shell" || tool === "bash") {
    const cmd = typeof r.command === "string" ? r.command : typeof r.cmd === "string" ? r.cmd : "";
    if (!cmd) return;
    for (const s of split(cmd)) {
      const why = s.trim() ? violation(s.trim()) : null;
      if (why) throw new Error(`[Policy Violation: uv-only-python]\n${why}`);
    }
    if (!/PYTHONIOENCODING/i.test(cmd) && SHIM.test(cmd)) {
      const pre = "$env:PYTHONIOENCODING='utf-8'; ";
      if (typeof r.command === "string") r.command = pre + cmd;
      else r.cmd = pre + cmd;
    }
    return;
  }
  if (tool !== "write" && tool !== "edit") return;
  const p = typeof r.filePath === "string" ? r.filePath : typeof r.path === "string" ? r.path : "";
  if (!p.endsWith(".py")) return;
  const content = tool === "write" ? (typeof r.content === "string" ? r.content : "") : typeof r.newString === "string" ? r.newString : "";
  if (!content.trim()) return;
  let existing = "";
  if (tool === "edit") try { existing = readFileSync(p, "utf8"); } catch {}
  if (OPS.test(content) && !HAS_PATHLIB.test(`${content}\n${existing}`)) throw new Error(`[Policy Violation: python-pathlib-guard]\nPython script '${p}' performs file/path operations but does not import 'pathlib'.\nRaw string path operations are forbidden due to Windows backslash parsing traps.${FIX_PATHLIB}`);
  if (BARE_OPEN.test(content)) throw new Error(`[Policy Violation: python-pathlib-guard]\nPython script '${p}' uses bare 'open()'. Use 'pathlib.Path' methods with explicit UTF-8 encoding.\nBare open() calls without explicit encoding suffer from Windows UTF-16LE / cp1252 corruption.${FIX_OPEN}`);
  if (HEADER.test(content)) throw new Error(HEADER_MSG);
}

async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (e: any) => inspect(String(e?.tool ?? ""), e?.input));
}
async function server() {
  return { "tool.execute.before": async (i: any, c: any) => inspect(String(i?.tool ?? ""), c?.args) };
}
export default { id: "python-guard", setup, server };
