import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forbiddenTerminalCommands from "./forbidden-terminal-commands";
import forcePathlib from "./force-pathlib";
import uvOnlyPython from "./uv-only-python";
import bannedPaths from "./banned-paths";
type Hook = (e: { tool: string; input: unknown }) => void | Promise<void>;
async function capture(plugin: any, label: string): Promise<Hook> {
  const reg: { name: string; cb: Hook }[] = [];
  if (typeof plugin?.setup !== "function") throw new Error(`${label} must export a setup function`);
  await plugin.setup({ tool: { hook: async (name: string, cb: Hook) => { reg.push({ name, cb }); } } });
  if (reg.length !== 1 || reg[0].name !== "execute.before") throw new Error(`${label} must register exactly one 'execute.before' hook`);
  return reg[0].cb;
}
const terminalHook = await capture(forbiddenTerminalCommands, "forbidden-terminal-commands");
const uvHook = await capture(uvOnlyPython, "uv-only-python");
const pathlibHook = await capture(forcePathlib, "force-pathlib");
async function capturePermission(plugin: any): Promise<(e: any) => void> {
  let cb: any;
  if (typeof plugin?.setup !== "function") throw new Error("banned-paths must export a setup function");
  await plugin.setup({ location: { directory: process.cwd() }, tool: { hook: async () => {} }, permission: { hook: async (_n: string, h: (e: any) => void) => { cb = h; } } });
  if (typeof cb !== "function") throw new Error("banned-paths must register a permission hook");
  return cb;
}
const bannedHook = await capturePermission(bannedPaths);
const ps1 = /\.ps[dm]?1$/i;
const checker = `${process.env.USERPROFILE}\\.agents\\scripts\\plugin-lint\\ps1-check.ps1`;
const describe = (file: string, problems: string) =>
  `ps1-lint: static analysis (parse, PSScriptAnalyzer, unresolved commands, unknown parameters, dead paths) found problems in ${file} (not saved). Fix them:\n${problems}`;
function checkPs1(path: string, content: string): void {
  if (!ps1.test(path) || !content.trim()) return;
  const b = (globalThis as any).Bun;
  if (!b?.spawnSync) return;
  const dir = mkdtempSync(join(tmpdir(), "ps1-"));
  try {
    const file = join(dir, "check.ps1");
    writeFileSync(file, content, "utf8");
    const r = b.spawnSync(["pwsh", "-NoProfile", "-NonInteractive", "-File", checker, file], { windowsHide: true });
    const text = r.stdout ? r.stdout.toString().trim() : "";
    if (text) throw new Error(describe(path, text));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function commandList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  return [];
}
function patchBlocks(body: string) {
  const blocks: { add: boolean; path: string; lines: string[] }[] = [];
  let cur: (typeof blocks)[number] | null = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^\*\*\*\s+(Add|Update)\s+File:\s*(.+?)\s*$/);
    if (h) { cur = { add: h[1].toLowerCase() === "add", path: h[2], lines: [] }; blocks.push(cur); continue; }
    if (line.startsWith("*** ")) { cur = null; continue; }
    if (cur && line.startsWith("+")) cur.lines.push(line.slice(1));
  }
  return blocks;
}
export async function inspectToolCall(name: string, args: any): Promise<void> {
  if (name === "read_file" || name === "read") {
    const path = typeof args?.path === "string" ? args.path : typeof args?.filePath === "string" ? args.filePath : "";
    if (path) {
      const event: any = { action: "read", resources: [path] };
      await bannedHook(event);
      if (event.effect === "deny") throw new Error(event.message);
    }
    return;
  }
  if (name === "run_commands") {
    for (const cmd of commandList(args?.commands)) {
      if (typeof cmd !== "string") continue;
      await terminalHook({ tool: "shell", input: { command: cmd } });
      await uvHook({ tool: "shell", input: { command: cmd } });
    }
    return;
  }
  if (name === "editor") {
    const path = typeof args?.path === "string" ? args.path : "";
    const text = typeof args?.new_text === "string" ? args.new_text : "";
    const edit = args?.old_text !== undefined && args?.old_text !== null;
    await pathlibHook({ tool: edit ? "edit" : "write", input: { path, filePath: path, ...(edit ? { newString: text } : { content: text }) } });
    if (!edit) checkPs1(path, text);
    return;
  }
  if (name === "apply_patch") {
    for (const b of patchBlocks(typeof args?.input === "string" ? args.input : "")) {
      const content = b.lines.join("\n");
      await pathlibHook({ tool: b.add ? "write" : "edit", input: { path: b.path, filePath: b.path, ...(b.add ? { content } : { newString: content }) } });
      if (b.add) checkPs1(b.path, content);
    }
  }
}
function readStdin(): string {
  try { const b = (globalThis as any).Bun; if (b?.stdin?.textSync) return String(b.stdin.textSync() ?? ""); } catch {}
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}
if ((import.meta as any).main) {
  const raw = readStdin();
  if (raw.trim()) {
    let payload: any;
    try { payload = JSON.parse(raw); } catch { console.log(JSON.stringify({ cancel: true, errorMessage: "Hook input is not valid JSON." })); }
    if (payload) {
      const call = payload.preToolUse ? { name: payload.preToolUse.toolName, args: payload.preToolUse.parameters ?? {} } : payload.tool_call ? { name: payload.tool_call.name, args: payload.tool_call.input ?? {} } : null;
      if (call) try { await inspectToolCall(typeof call.name === "string" ? call.name : "", call.args); } catch (e) { console.log(JSON.stringify({ cancel: true, errorMessage: e instanceof Error ? e.message : String(e) })); }
    }
  }
  process.exitCode = 0;
}
