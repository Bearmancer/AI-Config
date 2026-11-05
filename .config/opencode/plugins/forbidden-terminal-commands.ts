/**
 * OpenCode server plugin (2.x plugin shape).
 *
 * OpenCode 2.x validates the module's DEFAULT export as `{ id, setup }`
 * (or `{ id, effect }`) and runs `setup(ctx)`; hooks register on their
 * owning domain (`ctx.tool.hook(...)`). Throwing from `execute.before`
 * is the documented way to refuse a tool call — the thrown message
 * becomes the tool error the model reads.
 *
 * A named-export hook module (the 1.x/docs shape) is REJECTED on 2.x:
 *   PluginModule.LoadError: Plugin must export a default definition with
 *   an id and an effect or setup function. (cause: SchemaError(Missing key at ["default"]))
 * The loader logs one WARN and the server keeps running with the plugin
 * silently dead — hence the exacting shape here. Only the default object
 * is exported; `Plugin.define` from `@opencode/plugin` is an identity
 * function (the host validates the shape, not the helper), so this file
 * stays dependency-free.
 *
 * Policy: cmd.exe wrappers AND inline powershell/pwsh (-Command /
 * -EncodedCommand) are forbidden in OpenCode shells. Write a .bat/.ps1
 * (or .py) file and run it once instead.
 */

function splitTopLevel(cmd: string): string[] {
	const trimmed = cmd.trim();
	if (!trimmed) return [];

	const statements: string[] = [];
	let current = "";
	let inDouble = false;
	let inSingle = false;

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
			current += ch;
		} else if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			current += ch;
		} else if (
			!inDouble &&
			!inSingle &&
			(ch === ";" ||
				ch === "\n" ||
				(ch === "&" && trimmed[i + 1] === "&") ||
				(ch === "|" && trimmed[i + 1] === "|"))
		) {
			if (current.trim()) statements.push(current.trim());
			current = "";
			if (ch === "&" || ch === "|") i++;
		} else if (!inDouble && !inSingle && ch === "|") {
			if (current.trim()) statements.push(current.trim());
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim()) statements.push(current.trim());

	return statements;
}

function splitStatements(cmd: string): string[] {
	const out: string[] = [];
	for (const stmt of splitTopLevel(cmd)) {
		out.push(stmt);
		// `bash -c "cmd /c x"` / `sh -c 'pwsh -Command x'`: inspect the wrapped command too.
		const wrapped = stmt.match(/^(?:\S*[\\\/])?(?:ba|da|z|k)?sh(?:\.exe)?\s+(?:-\S+\s+)*?-\w*c\w*\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*$/i);
		if (wrapped) out.push(...splitStatements(wrapped[1] ?? wrapped[2] ?? ""));
	}
	return out;
}

function isForbiddenCmdInvocation(cmd: string): boolean {
	if (typeof cmd !== "string") return false;

	for (const stmt of splitStatements(cmd)) {
		const s = stmt.trim();
		if (!s) continue;

		const exeMatch = s.match(/^\s*(?:(?:call|start)\s+)?(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))/i);
		if (!exeMatch) continue;

		const binary = (exeMatch[1] || exeMatch[2] || exeMatch[3] || "").toLowerCase();
		if (binary === "cmd" || binary === "cmd.exe") return true;
		if (/[\\\/]cmd(?:\.exe)?$/.test(binary)) return true;
	}

	return false;
}

function isForbiddenPowerShellCommand(cmd: string): boolean {
	if (typeof cmd !== "string") return false;

	for (const stmt of splitStatements(cmd)) {
		const s = stmt.trim();
		if (!s) continue;

		const cmdMatch = s.match(
			/^(?:(?:&|start|exec)\s+|\bcmd(?:\.exe)?\s+\/[ck]\s+)?\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))/i
		);
		if (!cmdMatch) continue;

		const binary = (cmdMatch[1] || cmdMatch[2] || cmdMatch[3] || "").toLowerCase();
		if (!/^(?:.*[\\\/])?(?:powershell|pwsh)(?:\.exe)?$/.test(binary)) continue;

		const hasForbiddenFlags = /(?:^|\s)-(?:c(?:ommand)?|e(?:nc(?:odedcommand)?)?)\b/i.test(s);
		if (hasForbiddenFlags) return true;

		const hasFile = /(?:^|\s)-(?:f(?:ile)?)\s+(?:"[^"\n]+\.ps1"|'[^'\n]+\.ps1'|[^\s"';&|`()]+\.ps1)/i.test(s);
		if (hasFile) continue;

		return true;
	}

	return false;
}

const CMD_POLICY_ERROR_MESSAGE = `[Policy Violation: forbidden-terminal-commands]
cmd.exe is forbidden in OpenCode shells. Write a .bat (or .py) file and run it once: './task.bat' or 'uv run ./task.py'.`;

const POWERSHELL_POLICY_ERROR_MESSAGE = `[Policy Violation: forbidden-terminal-commands]
Inline 'powershell'/'pwsh' (-Command/-EncodedCommand) is forbidden in OpenCode shells. Write a .ps1 (or .py) file and run it once: './task.ps1' or 'uv run ./task.py'.`;

function inspectCommand(input: unknown): void {
	if (!input || typeof input !== "object") return;
	const record = input as Record<string, unknown>;
	const cmd =
		typeof record.command === "string"
			? record.command
			: typeof record.cmd === "string"
			? record.cmd
			: "";
	if (!cmd) return;

	if (isForbiddenCmdInvocation(cmd)) throw new Error(CMD_POLICY_ERROR_MESSAGE);
	if (isForbiddenPowerShellCommand(cmd)) throw new Error(POWERSHELL_POLICY_ERROR_MESSAGE);
}

interface ToolExecuteBeforeEvent {
	tool: string;
	input: unknown;
}

interface ToolDomainLike {
	hook: (
		name: string,
		callback: (event: ToolExecuteBeforeEvent) => void | Promise<void>
	) => Promise<unknown>;
}

interface PluginContextLike {
	tool?: ToolDomainLike;
}

async function setup(ctx: PluginContextLike): Promise<void> {
	if (!ctx?.tool || typeof ctx.tool.hook !== "function") return;
	await ctx.tool.hook("execute.before", (event) => {
		if (!event || event.tool !== "shell") return;
		inspectCommand(event.input);
	});
}

export default { id: "forbidden-terminal-commands", setup };
