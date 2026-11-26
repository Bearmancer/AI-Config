const pattern = /\buv(?:\.exe)?\s+run\b[^;|&\n]*?\bpython(?:\.exe)?\b(?:\s+-[A-Za-z]+)*\s+(?:"[^"]+\.py"|'[^']+\.py'|[^\s"';|&]+\.py\b)/i;
function inspect(command: unknown): void {
  if (typeof command !== "string") return;
  if (pattern.test(command)) {
    throw new Error(
      "Blocked by uv-run-script: `uv run ... python <file.py>`. Run `uv run <file.py> <args>` instead; " +
        "put dependencies (and isolation from any project) in the script's PEP 723 header " +
        "(# /// script / # requires-python = \">=3.12\" / # dependencies = [...] / # ///).",
    );
  }
}
async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (event: any) => {
    if (event.tool === "shell") inspect(event.input?.command);
  });
}
async function server() {
  return { "tool.execute.before": async (i: any, c: any) => { if (i?.tool === "bash") inspect(c?.args?.command); } };
}
export default { id: "uv-run-script", setup, server };
