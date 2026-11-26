import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [root, casesPath] = process.argv.slice(2);
const cases = JSON.parse(readFileSync(casesPath, "utf8"));
const tmp = mkdtempSync(join(tmpdir(), "guard-parity-"));
const load = (p: string) => import(pathToFileURL(p).href);
async function hookOf(mod: any) {
  const reg: { n: string; cb: any }[] = [];
  await mod.default.setup({ tool: { hook: async (n: string, cb: any) => reg.push({ n, cb }) } });
  if (reg.length !== 1 || reg[0].n !== "execute.before") throw new Error("expected one execute.before hook");
  return reg[0].cb;
}
const verdict = async (run: () => unknown) => { try { await run(); return null; } catch (e) { return (e as Error).message; } };
try {
  const oc = join(root, ".config/opencode/plugins");
  const kilo = join(root, ".config/kilo/plugin");
  const term = await hookOf(await load(join(oc, "forbidden-terminal-commands.ts")));
  const path = await hookOf(await load(join(oc, "force-pathlib.ts")));
  await term({ tool: "shell", input: null });
  await path({ tool: "write", input: {} });
  const kTerm = await (await load(join(kilo, "forbidden-terminal-commands.ts"))).default.server();
  const kPath = await (await load(join(kilo, "force-pathlib.ts"))).default.server();
  const cline = await load(join(root, ".cline/hooks/PreToolUse.ts"));
  const out: Record<string, Record<string, string | null>> = {};
  for (const c of cases) {
    const isCmd = typeof c.command === "string";
    const edit = c.tool === "edit";
    let p = c.path;
    if (typeof c.disk === "string") { p = join(tmp, c.path); writeFileSync(p, c.disk); }
    const event = isCmd
      ? { tool: "shell", input: { command: c.command } }
      : edit
      ? { tool: "edit", input: { path: p, filePath: p, newString: c.content } }
      : { tool: "write", input: { path: p, filePath: p, content: c.content } };
    out[c.id] = {
      opencode: await verdict(async () => { await term(event); await path(event); }),
      kilo: await verdict(() =>
        isCmd
          ? kTerm["tool.execute.before"]({ tool: "bash" }, { args: { command: c.command } })
          : kPath["tool.execute.before"]({ tool: edit ? "edit" : "write" }, { args: edit ? { filePath: p, newString: c.content } : { filePath: p, content: c.content } }),
      ),
      cline: await verdict(() =>
        isCmd
          ? cline.inspectToolCall("run_commands", { commands: [c.command] })
          : c.cline === "patch"
          ? cline.inspectToolCall("apply_patch", { input: `*** Begin Patch\n*** ${edit ? "Update" : "Add"} File: ${p}\n${String(c.content).split("\n").map((l: string) => "+" + l).join("\n")}\n*** End Patch` })
          : cline.inspectToolCall("editor", edit ? { path: p, old_text: "x", new_text: c.content } : { path: p, new_text: c.content }),
      ),
    };
  }
  console.log(JSON.stringify(out));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
