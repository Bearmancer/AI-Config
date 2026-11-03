function splitStatements(cmd: string): string[] {
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

// OpenCode plugin API: https://opencode.ai/docs/plugins (an exported plugin function returning the hooks).
// Only the plugin function is exported: OpenCode treats every exported function as a plugin.
export const ForbiddenTerminalCommands = async () => {
	return {
		"tool.execute.before": async (
			input: { tool: string },
			output: { args?: Record<string, unknown> }
		) => {
			if (input.tool !== "shell") return;
			inspectCommand(output?.args);
		},
	};
};
