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
    const w = s.match(/^(?:\S*[\\\/])?(?:ba|da|z|k)?sh(?:\.exe)?\s+(?:-\S+\s+)*?-\w*c\w*\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*$/i);
    if (w) out.push(...split(w[1] ?? w[2] ?? ""));
  }
  return out;
}
const INTERPRETER = /^(?:.*[\\\/])?(?:python[\d._]*|pypy[\d._]*|py)(?:\.exe)?$/;
const PIP = /^(?:.*[\\\/])?(?:pip[\d._]*|pipx)(?:\.exe)?$/;
function violation(stmt: string): string | null {
  const m = stmt.match(/^\s*(?:(?:call|start|exec|&)\s+)?(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))\s*(.*)$/i);
  if (!m) return null;
  const b = (m[1] || m[2] || m[3] || "").toLowerCase();
  const rest = (m[4] || "").trim();
  if (INTERPRETER.test(b)) return b === "py" || b === "py.exe" ? "`py` launcher is forbidden. Use uv: 'uv run ./script.py', 'uvx <tool>'." : `Direct '${b}' is forbidden. Use uv only: 'uv run ./script.py', 'uvx <tool>', or 'uv tool run <tool>'.`;
  if (PIP.test(b)) return `Direct '${b}' is forbidden. Use uv: 'uv pip ...' inside 'uv run', or 'uv tool install <pkg>'.`;
  if (/^(?:.*[\\\/])?virtualenv(?:\.exe)?$/.test(b)) return "`virtualenv` is forbidden. No venvs on this box — use 'uv run' / 'uvx' / 'uv tool'.";
  if ((b === "uv" || b === "uv.exe" || b === "uvx" || b === "uvx.exe") && (rest.split(/\s+/)[0] ?? "") === "venv") return "`uv venv` is forbidden. No venvs — run tools via 'uvx' and scripts via 'uv run'.";
  if ((b === "uv" || b === "uv.exe" || b === "uvx" || b === "uvx.exe") && (rest.split(/\s+/)[0] ?? "") === "virtualenv") return "`uv venv` is forbidden. No venvs — run tools via 'uvx' and scripts via 'uv run'.";
  return null;
}
function inspect(input: unknown): void {
  if (!input || typeof input !== "object") return;
  const r = input as Record<string, unknown>;
  const cmd = typeof r.command === "string" ? r.command : typeof r.cmd === "string" ? r.cmd : "";
  if (!cmd) return;
  for (const s of split(cmd)) {
    const why = s.trim() ? violation(s.trim()) : null;
    if (why) throw new Error(`[Policy Violation: uv-only-python]\n${why}`);
  }
}
async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (e: any) => { if (e?.tool === "shell") inspect(e.input); });
}
async function server() {
  return { "tool.execute.before": async (i: any, c: any) => { if (i?.tool === "bash") inspect(c?.args); } };
}
export default { id: "uv-only-python", setup, server };
