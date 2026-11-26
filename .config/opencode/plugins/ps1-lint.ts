import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const checker = `${process.env.USERPROFILE}\\.agents\\scripts\\plugin-lint\\ps1-check.ps1`;
const end = "__PS1_CHECK_END__";
const psFile = /\.ps[dm]?1$/i;

type Worker = {
  proc: Bun.Subprocess<"pipe", "pipe", "ignore">;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  buffer: string;
};
let worker: Worker | undefined;
let queue: Promise<unknown> = Promise.resolve();

function start(): Worker {
  const proc = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-File", checker, "-Serve"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    windowsHide: true,
  });
  proc.exited.then(() => {
    if (worker?.proc === proc) worker = undefined;
  });
  return { proc, reader: proc.stdout.getReader(), buffer: "" };
}

async function ask(file: string): Promise<string> {
  worker ??= start();
  const current = worker;
  current.proc.stdin.write(`${file}\n`);
  current.proc.stdin.flush();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => current.proc.kill(), 30_000);
  try {
    while (!current.buffer.includes(end)) {
      const { value, done } = await current.reader.read();
      if (done) throw new Error("ps1-lint worker exited");
      current.buffer += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timer);
  }
  const cut = current.buffer.indexOf(end);
  const text = current.buffer.slice(0, cut);
  current.buffer = current.buffer.slice(cut + end.length).replace(/^\r?\n/, "");
  return text.trim();
}

function lint(file: string): Promise<string> {
  const run = queue.then(() => ask(file));
  queue = run.catch(() => {
    worker?.proc.kill();
    worker = undefined;
  });
  return run;
}

const describe = (file: string, problems: string) =>
  `ps1-lint: static analysis (parse, PSScriptAnalyzer, unresolved commands, unknown parameters, dead paths) found problems in ${file} (saved as written). Fix them:\n${problems}`;

const home = process.env.USERPROFILE ?? "";
const pathToken = /(?:"([^"\r\n]+?\.ps[dm]?1)"|'([^'\r\n]+?\.ps[dm]?1)'|((?:[A-Za-z]:|\$HOME|\$env:USERPROFILE|~|\.{1,2})?[\\/]?[^\s"'`;|&(){}<>,=]+?\.ps[dm]?1))(?![\w.])/gi;

function mentionedFiles(command: string, cwd: string): string[] {
  const found = new Set<string>();
  for (const m of command.matchAll(pathToken)) {
    let raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw || raw.includes("*") || raw.includes("$(")) continue;
    raw = raw.replace(/^(\$HOME|\$env:USERPROFILE|~)(?=[\\/])/i, home);
    if (/\$/.test(raw)) continue;
    found.add(isAbsolute(raw) ? raw : resolve(cwd, raw));
  }
  return [...found];
}

function mtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return -1;
  }
}

const before = new Map<string, Map<string, number>>();
const keyOf = (event: any) =>
  String(event.callID ?? event.id ?? event.toolCallID ?? `${event.sessionID ?? ""}|${event.input?.command ?? ""}`);

function appendNote(event: any, note: string) {
  const result = event.result ?? {};
  if (Array.isArray(result.content)) {
    event.result = { ...result, content: [...result.content, { type: "text", text: note }] };
  } else if (typeof result.content === "string") {
    event.result = { ...result, content: `${result.content}\n\n${note}` };
  } else if (typeof result.output === "string") {
    event.result = { ...result, output: `${result.output}\n\n${note}` };
  } else {
    event.result = { ...result, content: [{ type: "text", text: note }] };
  }
}

async function setup(ctx: any) {
  lint(checker).catch(() => {});
  await ctx.tool.hook("execute.before", (event: any) => {
    if (event.tool !== "shell" || typeof event.input?.command !== "string") return;
    const cwd = typeof event.input.workdir === "string" ? event.input.workdir : ctx.location.directory;
    const files = mentionedFiles(event.input.command, cwd);
    if (!files.length) return;
    before.set(keyOf(event), new Map(files.map((f) => [f, mtime(f)])));
  });
  await ctx.tool.hook("execute.after", async (event: any) => {
    if (event.tool === "shell") {
      const seen = before.get(keyOf(event));
      before.delete(keyOf(event));
      if (!seen) return;
      const notes: string[] = [];
      for (const [file, old] of seen) {
        const now = mtime(file);
        if (now < 0 || now === old) continue;
        const problems = await lint(file).catch((e) => `ps1-lint failed: ${e}`);
        if (problems) notes.push(describe(file, problems));
      }
      if (notes.length) appendNote(event, notes.join("\n\n"));
      return;
    }
    if (event.status !== "completed" || (event.tool !== "write" && event.tool !== "edit")) return;
    const file = event.input?.path;
    if (typeof file !== "string" || !psFile.test(file)) return;
    const problems = await lint(file);
    if (problems) throw new Error(describe(file, problems));
  });
  return () => {
    worker?.proc.kill();
    worker = undefined;
  };
}

async function server() {
  const ev = (i: any) => ({ callID: i?.callID, id: i?.id, toolCallID: i?.toolCallID, sessionID: i?.sessionID, input: { command: i?.args?.command ?? i?.command } });
  return {
    "tool.execute.before": async (i: any, c: any) => {
      if (i?.tool !== "bash" || typeof c?.args?.command !== "string") return;
      const cwd = typeof c?.args?.workdir === "string" ? c.args.workdir : process.cwd();
      const files = mentionedFiles(c.args.command, cwd);
      if (!files.length) return;
      before.set(keyOf(ev(i)), new Map(files.map((f) => [f, mtime(f)])));
    },
    "tool.execute.after": async (i: any, c: any) => {
      if (i?.tool === "bash") {
        const seen = before.get(keyOf(ev(i)));
        before.delete(keyOf(ev(i)));
        if (!seen) return;
        const notes: string[] = [];
        for (const [file, old] of seen) {
          const now = mtime(file);
          if (now < 0 || now === old) continue;
          const problems = await lint(file).catch((e) => `ps1-lint failed: ${e}`);
          if (problems) notes.push(describe(file, problems));
        }
        if (notes.length) appendNote(c, notes.join("\n\n"));
        return;
      }
      if (i?.tool !== "write" && i?.tool !== "edit") return;
      const file = i?.args?.filePath ?? i?.args?.path ?? i?.filePath ?? c?.args?.filePath ?? c?.filePath;
      if (typeof file !== "string" || !psFile.test(file)) return;
      const problems = await lint(file);
      if (problems) throw new Error(describe(file, problems));
    },
  };
}

export default { id: "ps1-lint", setup, server };
