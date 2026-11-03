import { readFileSync } from "node:fs";

// Cline PreToolUse hook: same detectors and messages as the OpenCode plugins
// forbidden-terminal-commands.ts and force-pathlib.ts.
// Mechanism: Cline runs ~/.cline/hooks/PreToolUse.<ext> (here .ts, via `bun run`) with the
// hook payload as JSON on stdin; stdout `{"cancel":true,"errorMessage":...}` blocks the tool call.
// Source: @cline/core hook-file-config (event names, search paths), K3 (control output).

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

/**
 * Validates Python scripts created or modified via write/edit tools.
 * Enforces:
 * 1. Must use `pathlib.Path` whenever performing path or file operations.
 * 2. Forbids bare `open(...)` calls without Path.
 * 3. Requires explicit UTF-8 encoding when reading/writing files.
 */
// `existing` is the file's on-disk content for edit-type tools: the new fragment alone cannot show a pathlib import that is already there.
function inspectPythonPathlib(path: string, content: string, existing = ""): void {
  if (typeof path !== "string" || !path.endsWith(".py")) return;
  if (typeof content !== "string" || !content.trim()) return;

  // Check if content does file / path operations
  const fileOpRegex =
    /(?:\b(?:open\s*\(|os\.path\b|os\.listdir\b|os\.walk\b|os\.mkdir\b|os\.makedirs\b|os\.remove\b|os\.unlink\b|shutil\b))/;
  const hasFileOps = fileOpRegex.test(content);

  // Check if pathlib / Path is imported
  const importsPathlib = /(?:from\s+pathlib\s+import|\bimport\s+pathlib\b)/.test(`${content}\n${existing}`);

  // Check for bare open(...) call that doesn't go through Path
  const hasBareOpen = /(?<!\.)\bopen\s*\(/.test(content);

  if (hasFileOps && !importsPathlib) {
    throw new Error(
      `[Policy Violation: python-pathlib-guard]\n` +
        `Python script '${path}' performs file/path operations but does not import 'pathlib'.\n` +
        `Raw string path operations are forbidden due to Windows backslash parsing traps.\n\n` +
        `Remediation:\n` +
        `1. Import Path: from pathlib import Path\n` +
        `2. Read files: Path(p).read_text(encoding="utf-8")\n` +
        `3. Write files: Path(p).write_text(content, encoding="utf-8")\n` +
        `4. Paths: Use Path(r'C:\\...') or forward slashes Path('C:/...')`
    );
  }

  if (hasBareOpen) {
    throw new Error(
      `[Policy Violation: python-pathlib-guard]\n` +
        `Python script '${path}' uses bare 'open()'. Use 'pathlib.Path' methods with explicit UTF-8 encoding.\n` +
        `Bare open() calls without explicit encoding suffer from Windows UTF-16LE / cp1252 corruption.\n\n` +
        `Remediation:\n` +
        `1. Read files: Path(p).read_text(encoding="utf-8")\n` +
        `2. Write files: Path(p).write_text(content, encoding="utf-8")\n` +
        `3. Or stream: Path(p).open("r", encoding="utf-8")`
    );
  }
}


function readExisting(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export { isForbiddenCmdInvocation, isForbiddenPowerShellCommand, inspectPythonPathlib };

function commandStrings(input: unknown): string[] {
	if (typeof input === "string") return [input];
	if (Array.isArray(input)) return input.flatMap(commandStrings);
	if (!input || typeof input !== "object") return [];
	const r = input as Record<string, unknown>;
	if (r.commands !== undefined) return commandStrings(r.commands);
	if (typeof r.command === "string") {
		const args = Array.isArray(r.args) ? r.args.filter((a): a is string => typeof a === "string") : [];
		return [[r.command, ...args].join(" ")];
	}
	if (typeof r.cmd === "string") return [r.cmd];
	return [];
}

// Throws the policy error for the first violation, mirroring the OpenCode plugins.
export function inspectToolCall(name: string, input: unknown): void {
	if (name === "run_commands") {
		for (const cmd of commandStrings(input)) {
			if (isForbiddenCmdInvocation(cmd)) throw new Error(CMD_POLICY_ERROR_MESSAGE);
			if (isForbiddenPowerShellCommand(cmd)) throw new Error(POWERSHELL_POLICY_ERROR_MESSAGE);
		}
	} else if (name === "editor") {
		const r = (input ?? {}) as Record<string, unknown>;
		if (typeof r.path === "string" && typeof r.new_text === "string") {
			// old_text / insert_line mean an edit of an existing file; otherwise the file is created or replaced.
			const isEdit = r.old_text != null || r.insert_line != null;
			inspectPythonPathlib(r.path, r.new_text, isEdit ? readExisting(r.path) : "");
		}
	} else if (name === "apply_patch") {
		const text = typeof input === "string" ? input : typeof (input as Record<string, unknown>)?.input === "string" ? ((input as Record<string, unknown>).input as string) : "";
		let path = "";
		let update = false;
		let body: string[] = [];
		const flush = () => {
			if (path) inspectPythonPathlib(path, body.join("\n"), update ? readExisting(path) : "");
			path = "";
			update = false;
			body = [];
		};
		for (const line of text.split(/\r?\n/)) {
			const head = line.match(/^\*\*\* (Add|Update) File: (.+)$/);
			if (head || line.startsWith("*** ")) {
				flush();
				if (head) {
					path = head[2].trim();
					update = head[1] === "Update";
				}
			} else if (path && line.startsWith("+")) body.push(line.slice(1));
		}
		flush();
	}
}

async function main(): Promise<void> {
	let payload: { tool_call?: { name?: string; input?: unknown }; preToolUse?: { toolName?: string } };
	try {
		payload = JSON.parse(await Bun.stdin.text());
	} catch {
		return;
	}
	const name = payload.tool_call?.name ?? payload.preToolUse?.toolName ?? "";
	try {
		inspectToolCall(name, payload.tool_call?.input);
	} catch (e) {
		process.stdout.write(JSON.stringify({ cancel: true, errorMessage: (e as Error).message }));
	}
}

if (import.meta.main) await main();
