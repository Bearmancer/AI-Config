import { win32 } from "path";
const banned = new Set(["ssh", "scp", "sftp", "plink"]);
function commandNames(command: string): string[] {
  return command
    .replace(/"[^"]*"|'[^']*'/g, "")
    .split(/[;|&(){}\n]+/)
    .map((part) => part.trim().split(/\s+/)[0] ?? "")
    .map((word) => win32.parse(word).name.toLowerCase());
}
function inspect(command: unknown): void {
  if (typeof command !== "string") return;
  if (commandNames(command).some((name) => banned.has(name))) {
    throw new Error(
      "Blocked by ssh-paramiko-only: the ssh/scp/sftp/plink CLI. Use `paramiko-run <host> --command ...` instead.",
    );
  }
}
async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (event: any) => {
    if (event.tool === "shell") inspect(event.input?.command);
  });
}
async function core(_action: string, resources: string[]) {
  try { inspect(resources[0]); } catch (e) { return { message: (e as Error).message }; }
  return {};
}
async function server() {
  return { core, "tool.execute.before": async (i: any, c: any) => { if (i?.tool === "bash") inspect(c?.args?.command); } };
}
export default { id: "ssh-paramiko-only", setup, server };
