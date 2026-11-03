// Runs every case in guard_parity_cases.json through the OpenCode plugins, the Kilo plugins
// and the Cline PreToolUse hook, and prints one verdict per implementation as JSON.
// argv: <repo root> <cases.json>. All implementations are the real files in the repo.
// A case is either {command} or {path, content, tool?, disk?, cline?}: tool "edit" sends the content as an edit
// fragment of a file whose on-disk content is `disk` (written to a temp dir; path is then relative to it);
// cline "patch" makes the Cline hook receive the same change as an apply_patch payload.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, casesPath] = process.argv.slice(2);
const cases = JSON.parse(readFileSync(casesPath, "utf8"));
const tmp = mkdtempSync(join(tmpdir(), "guard-parity-"));

async function load(path: string) {
	return await import(pathToFileURL(path).href);
}

async function verdict(run: () => unknown): Promise<string | null> {
	try {
		await run();
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

try {
	const oc = join(root, ".config/opencode/plugins");
	const kilo = join(root, ".config/kilo/plugin");
	const ocTerm = await (await load(join(oc, "forbidden-terminal-commands.ts"))).ForbiddenTerminalCommands();
	const ocPath = await (await load(join(oc, "force-pathlib.ts"))).ForcePathlib();
	const kTerm = await (await load(join(kilo, "forbidden-terminal-commands.ts"))).default.server();
	const kPath = await (await load(join(kilo, "force-pathlib.ts"))).default.server();
	const cline = await import(pathToFileURL(join(root, ".cline/hooks/PreToolUse.ts")).href);
	const out: Record<string, Record<string, string | null>> = {};
	for (const c of cases) {
		const term = typeof c.command === "string";
		const edit = c.tool === "edit";
		let path: string = c.path;
		if (typeof c.disk === "string") {
			path = join(tmp, c.path);
			writeFileSync(path, c.disk);
		}
		const clineCall = () => {
			if (term) return cline.inspectToolCall("run_commands", { commands: [c.command] });
			if (c.cline === "patch") {
				const kind = edit ? "Update" : "Add";
				const body = String(c.content).split("\n").map((l: string) => "+" + l).join("\n");
				return cline.inspectToolCall("apply_patch", { input: `*** Begin Patch\n*** ${kind} File: ${path}\n${body}\n*** End Patch` });
			}
			return cline.inspectToolCall("editor", edit ? { path, old_text: "x", new_text: c.content } : { path, new_text: c.content });
		};
		out[c.id] = {
			opencode: await verdict(() =>
				term
					? ocTerm["tool.execute.before"]({ tool: "shell" }, { args: { command: c.command } })
					: edit
					? ocPath["tool.execute.before"]({ tool: "edit" }, { args: { filePath: path, newString: c.content } })
					: ocPath["tool.execute.before"]({ tool: "write" }, { args: { path, content: c.content } }),
			),
			kilo: await verdict(() =>
				term
					? kTerm["tool.execute.before"]({ tool: "bash" }, { args: { command: c.command } })
					: kPath["tool.execute.before"]({ tool: edit ? "edit" : "write" }, { args: edit ? { filePath: path, newString: c.content } : { filePath: path, content: c.content } }),
			),
			cline: await verdict(clineCall),
		};
	}
	console.log(JSON.stringify(out));
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
