const PREFIX = "$env:PYTHONIOENCODING='utf-8'; ";
const SHIM = /(?:^|[;&|\n])\s*(?:&\s*)?(?:"[^"\n]*[\\/]tvly(?:\.exe)?"|'[^'\n]*[\\/]tvly(?:\.exe)?'|(?:[^\s"';&|]+[\\/])?tvly(?:\.exe)?)(?=\s|$)/i;
function inspect(input: unknown): void {
  if (!input || typeof input !== "object") return;
  const r = input as Record<string, unknown>;
  const cmd = typeof r.command === "string" ? r.command : typeof r.cmd === "string" ? r.cmd : "";
  if (!cmd || /PYTHONIOENCODING/i.test(cmd) || !SHIM.test(cmd)) return;
  if (typeof r.command === "string") r.command = PREFIX + cmd;
  else if (typeof r.cmd === "string") r.cmd = PREFIX + cmd;
}
async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (e: any) => { if (e?.tool === "shell") inspect(e.input); });
}
async function server() {
  return { "tool.execute.before": async (i: any, c: any) => { if (i?.tool === "bash") inspect(c?.args); } };
}
export default { id: "python-cli-utf8", setup, server };
