// Runs every case in guard_parity_cases.json through the OpenCode plugins, the Kilo plugins
// and the Cline PreToolUse hook, and prints one verdict per implementation as JSON.
// argv: <repo root> <cases.json>. All implementations are the real files in the repo.
// A case is either {command} or {path, content, tool?, disk?, cline?}: tool "edit" sends the content as an edit
// fragment of a file whose on-disk content is `disk` (written to a temp dir; path is then relative to it);
// cline "patch" makes the Cline hook receive the same change as an apply_patch payload.
import assert from "node:assert/strict";
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

type HookCallback = (event: { tool: string; input: unknown }) => void | Promise<void>;

interface FakePluginContext {
	tool: {
		hook: (name: string, cb: HookCallback) => Promise<unknown> | unknown;
	};
}

function makeFakeContext() {
	const registered: { name: string; cb: HookCallback }[] = [];
	const ctx: FakePluginContext = {
		tool: {
			hook: async (name: string, cb: HookCallback) => {
				registered.push({ name, cb });
			},
		},
	};
	return { ctx, registered };
}

try {
	const oc = join(root, ".config/opencode/plugins");
	const kilo = join(root, ".config/kilo/plugin");

	// OpenCode 2.x default export plugin setup
	const ocTermMod = await load(join(oc, "forbidden-terminal-commands.ts"));
	const ocTermDef = ocTermMod.default;
	assert.ok(ocTermDef && typeof ocTermDef === "object", "forbidden-terminal-commands must export a default object");
	assert.equal(ocTermDef.id, "forbidden-terminal-commands", "expected id 'forbidden-terminal-commands'");
	assert.equal(typeof ocTermDef.setup, "function", "forbidden-terminal-commands must export a setup function");

	const termFake = makeFakeContext();
	await ocTermDef.setup(termFake.ctx);
	assert.equal(termFake.registered.length, 1, "forbidden-terminal-commands must register exactly 1 hook");
	assert.equal(termFake.registered[0].name, "execute.before", "expected hook name 'execute.before'");
	const ocTermHook = termFake.registered[0].cb;

	const ocPathMod = await load(join(oc, "force-pathlib.ts"));
	const ocPathDef = ocPathMod.default;
	assert.ok(ocPathDef && typeof ocPathDef === "object", "force-pathlib must export a default object");
	assert.equal(ocPathDef.id, "force-pathlib", "expected id 'force-pathlib'");
	assert.equal(typeof ocPathDef.setup, "function", "force-pathlib must export a setup function");

	const pathFake = makeFakeContext();
	await ocPathDef.setup(pathFake.ctx);
	assert.equal(pathFake.registered.length, 1, "force-pathlib must register exactly 1 hook");
	assert.equal(pathFake.registered[0].name, "execute.before", "expected hook name 'execute.before'");
	const ocPathHook = pathFake.registered[0].cb;

	// Edge-case assertions for OpenCode 2.x hook callbacks:
	// Non-matching tools are ignored
	await ocTermHook({ tool: "edit", input: { command: "cmd /c echo hi" } });
	await ocTermHook({ tool: "write", input: { command: "cmd /c echo hi" } });
	await ocTermHook({ tool: "other", input: { command: "cmd /c echo hi" } });
	await ocPathHook({ tool: "shell", input: { path: "x.py", content: "import os\nos.listdir()" } });
	await ocPathHook({ tool: "other", input: { path: "x.py", content: "import os\nos.listdir()" } });

	// Malformed or absent input is handled cleanly without uncaught exceptions
	await ocTermHook(null as any);
	await ocTermHook(undefined as any);
	await ocTermHook({ tool: "shell", input: null });
	await ocTermHook({ tool: "shell", input: undefined });
	await ocTermHook({ tool: "shell", input: {} });
	await ocTermHook({ tool: "shell", input: "invalid-input" });
	await ocTermHook({ tool: "shell", input: { command: 123 } });

	await ocPathHook(null as any);
	await ocPathHook(undefined as any);
	await ocPathHook({ tool: "write", input: null });
	await ocPathHook({ tool: "write", input: undefined });
	await ocPathHook({ tool: "write", input: {} });
	await ocPathHook({ tool: "write", input: "invalid-input" });
	await ocPathHook({ tool: "write", input: { path: 123, content: 456 } });
	await ocPathHook({ tool: "edit", input: null });
	await ocPathHook({ tool: "edit", input: undefined });
	await ocPathHook({ tool: "edit", input: {} });

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
			opencode: await verdict(async () => {
				const event = term
					? { tool: "shell", input: { command: c.command } }
					: edit
					? { tool: "edit", input: { path, filePath: path, newString: c.content } }
					: { tool: "write", input: { path, filePath: path, content: c.content } };
				await ocTermHook(event);
				await ocPathHook(event);
			}),
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
