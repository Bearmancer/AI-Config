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
const CMD_MSG = `[Policy Violation: forbidden-terminal-commands]
cmd.exe is forbidden in OpenCode shells. Write a .bat (or .py) file and run it once: './task.bat' or 'uv run ./task.py'.`;
const PWSH_MSG = `[Policy Violation: forbidden-terminal-commands]
Inline 'powershell'/'pwsh' (-Command/-EncodedCommand) is forbidden in OpenCode shells. Write a .ps1 (or .py) file and run it once: './task.ps1' or 'uv run ./task.py'.`;
const inlineFlag = /(?:^|\s)-(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?|commandwithargs|cwa|e|ec|enc(?:o(?:d(?:e(?:d(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?)?)?)?)?)?)(?=\s|:|$)/i;
const fileFlag = /(?:^|\s)-f(?:i(?:l(?:e)?)?)?[ =](?:"[^"\n]+"|'[^'\n]+'|[^\s"';&|`()]+)/i;
function inspect(input: unknown): void {
  if (!input || typeof input !== "object") return;
  const r = input as Record<string, unknown>;
  const cmd = typeof r.command === "string" ? r.command : typeof r.cmd === "string" ? r.cmd : "";
  if (!cmd) return;
  const stmts = split(cmd);
  for (const s of stmts) {
    const m = s.match(/^\s*(?:(?:call|start)\s+)?(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))/i);
    if (!m) continue;
    const b = (m[1] || m[2] || m[3] || "").toLowerCase();
    if (b === "cmd" || b === "cmd.exe" || /[\\\/]cmd(?:\.exe)?$/.test(b)) throw new Error(CMD_MSG);
  }
  for (const s of stmts) {
    const m = s.match(/^(?:(?:&|start|exec)\s+|\bcmd(?:\.exe)?\s+\/[ck]\s+)?\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))/i);
    if (!m) continue;
    const b = (m[1] || m[2] || m[3] || "").toLowerCase();
    if (!/^(?:.*[\\\/])?(?:powershell|pwsh)(?:\.exe)?$/.test(b)) continue;
    if (inlineFlag.test(s)) throw new Error(PWSH_MSG);
    if (fileFlag.test(s)) continue;
    throw new Error(PWSH_MSG);
  }
}
async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (e: any) => { if (e?.tool === "shell") inspect(e.input); });
}
async function core(_action: string, resources: string[]) {
  try { inspect({ command: resources[0] }); } catch (e) { return { message: (e as Error).message }; }
  return {};
}
async function server() {
  return { core, "tool.execute.before": async (i: any, c: any) => { if (i?.tool === "bash") inspect(c?.args); } };
}
export default { id: "forbidden-terminal-commands", setup, server };
