import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export const home = homedir().replace(/\\/g, "/");
const drive = /^\\\\[?.]\\([A-Za-z]:)/;
export const absolutize = (p: string, base = home) =>
  resolve(base, p.replace(drive, "$1")).replace(/\\/g, "/");
const clean = (p: any) => (typeof p === "string" ? absolutize(p.trim()) : undefined);

export type Part = { action: string; resources: string[]; content?: string; paths: string[] };
export type Decision = { message?: string; command?: string; paths: string[] };

const py = /\.py$/i;

export function parts(name: string, input: any): Part | undefined {
  if (name === "read_files") {
    const paths = (Array.isArray(input?.files) ? input.files : [])
      .map((f: any) => clean(typeof f === "string" ? f : f?.path))
      .filter(Boolean);
    return paths.length ? { action: "read", resources: paths, paths } : undefined;
  }
  if (name === "editor") {
    const path = clean(input?.path);
    if (!path) return;
    const content = typeof input?.new_text === "string" ? input.new_text : undefined;
    return { action: "edit", resources: [path], content, paths: [path] };
  }
  if (name === "apply_patch") {
    const text = typeof input === "string" ? input : (input?.input ?? input?.patch ?? "");
    const paths = [...String(text).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
      .map((m) => clean(m[1]))
      .filter(Boolean);
    return { action: "edit", resources: paths, content: String(text), paths };
  }
  if (name === "run_commands") {
    const commands = (Array.isArray(input?.commands) ? input.commands : [])
      .map((c: any) => (typeof c === "string" ? c : c?.command))
      .filter((c: any) => typeof c === "string");
    return commands.length ? { action: "shell", resources: commands, paths: [] } : undefined;
  }
  if (name === "search_codebase" || name === "fetch_web_content") {
    const resources = [
      ...(Array.isArray(input?.queries) ? input.queries : [input?.query]),
      clean(input?.path ?? input?.target_directory ?? input?.url),
    ].filter(Boolean);
    return resources.length ? { action: "glob", resources, paths: [] } : undefined;
  }
}

export function writeParts(content: string): Part[] {
  const files = content.split(/\n(?=\*\*\* (?:Add|Update|Delete) File: )/);
  const out: Part[] = [];
  for (const chunk of files) {
    const path = clean(chunk.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/m)?.[1]);
    if (!path) continue;
    const body = chunk
      .split("\n")
      .filter((l, i) => i === 0 || (!/^\*\*\*/.test(l) && !/^@@/.test(l) && !/^\s*[-?]/.test(l)))
      .map((l) => (l.startsWith("+") ? l.slice(1) : l))
      .join("\n");
    out.push({ action: "edit", resources: [path], content: body, paths: [path] });
  }
  return out;
}

export async function run(
  parts: Part[],
  guard: (action: string, resources: string[], content?: string) => Promise<Decision>,
  rewrite: (command: string) => string,
): Promise<string> {
  let command: string | undefined;
  const paths = new Set<string>();
  for (const part of parts) {
    const d = await guard(part.action, part.resources, part.content);
    d.paths.forEach((p) => paths.add(p));
    if (part.action === "shell") command = d.command ?? rewrite(part.resources[0]);
    if (d.message) return JSON.stringify({ cancel: true, errorMessage: d.message });
  }
  const body: any = { cancel: false };
  if (command && command !== parts[0].resources[0]) body.overrideInput = { commands: [{ command }] };
  const pyPaths = [...paths].filter((p) => py.test(p));
  if (pyPaths.length)
    body.contextModification =
      `Reminder for ${pyPaths.join(", ")}: read and write with pathlib.Path(...).read_text/write_text(encoding="utf-8") (write_text newline handling differs from open()), never bare open(), because Windows defaults to a non-UTF-8 codec. This call already went through; fix the file before relying on it.`;
  return JSON.stringify(body);
}

export const pythonEdit = (list: Part[]) =>
  list.some((p) => p.action === "edit" && p.paths.some((x) => py.test(x)));
export const textOf = (x: any) => (typeof x === "string" ? x : JSON.stringify(x));
