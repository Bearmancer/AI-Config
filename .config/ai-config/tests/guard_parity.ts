// Runs every case in guard_parity_cases.json through the OpenCode plugins, the Kilo plugins
// and the Cline PreToolUse hook, and prints one verdict per implementation as JSON.
// argv: <repo root> <cases.json>. All implementations are the real files in the repo.
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
		out[c.id] = {
			opencode: await verdict(() =>
				term
					? ocTerm["tool.execute.before"]({ tool: "shell" }, { args: { command: c.command } })
					: ocPath["tool.execute.before"]({ tool: "write" }, { args: { path: c.path, content: c.content } }),
			),
			kilo: await verdict(() =>
				term
					? kTerm["tool.execute.before"]({ tool: "bash" }, { args: { command: c.command } })
					: kPath["tool.execute.before"]({ tool: "write" }, { args: { filePath: c.path, content: c.content } }),
			),
			cline: await verdict(() =>
				term
					? cline.inspectToolCall("run_commands", { commands: [c.command] })
					: cline.inspectToolCall("editor", { path: c.path, new_text: c.content }),
			),
		};
	}
	console.log(JSON.stringify(out));
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
