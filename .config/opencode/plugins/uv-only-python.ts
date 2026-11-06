/**
 * OpenCode server plugin (2.x plugin shape).
 *
 * Enforces the owner rule (2026-11-05): all Python work on this box goes
 * through uv ONLY — `uv run`, `uvx` / `uv tool run`, `uv tool install`.
 *
 * Forbidden:
 *  - `py`, `python`, `python3`, `pip`, `pip3` invoked directly (bare python
 *    was already `uv run` per AGENTS.md; now refusal is enforced)
 *  - any venv, created any way: `python -m venv`, `uv venv`, `virtualenv`
 *  - interpreters inside a venv (`...\Scripts\python.exe`, `.../bin/python`)
 *
 * Allowed: anything whose executable is `uv`/`uvx` except `uv venv` —
 * `uv run python script.py` and `uvx yt-dlp ...` stay legal.
 *
 * Same shape as forbidden-terminal-commands.ts: default export
 * `{ id, setup }`, hook via `ctx.tool.hook("execute.before")`, throw to
 * refuse — the thrown message is the tool error the model reads.
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
		// `bash -c "python x"` / `sh -c 'uv venv'`: inspect the wrapped command too.
		const wrapped = stmt.match(/^(?:\S*[\\\/])?(?:ba|da|z|k)?sh(?:\.exe)?\s+(?:-\S+\s+)*?-\w*c\w*\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*$/i);
		if (wrapped) out.push(...splitStatements(wrapped[1] ?? wrapped[2] ?? ""));
	}
	return out;
}

function firstToken(stmt: string): { binary: string; rest: string } | null {
	const m = stmt.match(/^\s*(?:(?:call|start|exec|&)\s+)?(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"';&|`()]+))\s*(.*)$/i);
	if (!m) return null;
	return {
		binary: (m[1] || m[2] || m[3] || "").toLowerCase(),
		rest: (m[4] || "").trim(),
	};
}

const INTERPRETER_RE = /^(?:.*[\\\/])?(?:python[\d._]*|pypy[\d._]*|py)(?:\.exe)?$/;
const PIP_RE = /^(?:.*[\\\/])?(?:pip[\d._]*|pipx)(?:\.exe)?$/;

function violation(stmt: string): string | null {
	const tok = firstToken(stmt);
	if (!tok) return null;
	const { binary, rest } = tok;

	// venv paths: an interpreter resolved inside a venv is still python.
	if (INTERPRETER_RE.test(binary)) {
		if (binary === "py" || binary === "py.exe") {
			return "`py` launcher is forbidden. Use uv: 'uv run ./script.py', 'uvx <tool>'.";
		}
		return `Direct '${binary}' is forbidden. Use uv only: 'uv run ./script.py', 'uvx <tool>', or 'uv tool run <tool>'.`;
	}
	if (PIP_RE.test(binary)) {
		return `Direct '${binary}' is forbidden. Use uv: 'uv pip ...' inside 'uv run', or 'uv tool install <pkg>'.`;
	}
	// python -m venv is caught above; block venv makers themselves.
	if (/^(?:.*[\\\/])?virtualenv(?:\.exe)?$/.test(binary)) {
		return "`virtualenv` is forbidden. No venvs on this box — use 'uv run' / 'uvx' / 'uv tool'.";
	}
	if (binary === "uv" || binary === "uv.exe" || binary === "uvx" || binary === "uvx.exe") {
		const sub = rest.split(/\s+/)[0] ?? "";
		if (sub === "venv" || sub === "virtualenv") {
			return "`uv venv` is forbidden. No venvs — run tools via 'uvx' and scripts via 'uv run'.";
		}
	}
	return null;
}

const PREAMBLE = "[Policy Violation: uv-only-python]";

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

	for (const stmt of splitStatements(cmd)) {
		const reason = stmt.trim() ? violation(stmt.trim()) : null;
		if (reason) throw new Error(`${PREAMBLE}\n${reason}`);
	}
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

export default { id: "uv-only-python", setup };
