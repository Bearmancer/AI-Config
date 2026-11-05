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
 * Policy: Python scripts written or edited via write/edit must use
 * `pathlib.Path` for path/file operations and must not use bare
 * `open(...)`; explicit UTF-8 encoding is required.
 */
import { readFileSync } from "node:fs";

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

function inspectToolInput(tool: string, input: unknown): void {
  if (!input || typeof input !== "object") return;
  const record = input as Record<string, unknown>;

  // OpenCode 1 names the path `filePath`; OpenCode 2 renamed it to `path`. Both accepted.
  const filePath =
    typeof record.filePath === "string"
      ? record.filePath
      : typeof record.path === "string"
      ? record.path
      : "";
  if (!filePath.endsWith(".py")) return;

  const content =
    tool === "write"
      ? typeof record.content === "string"
        ? record.content
        : ""
      : tool === "edit"
      ? typeof record.newString === "string"
        ? record.newString
        : ""
      : "";

  inspectPythonPathlib(filePath, content, tool === "edit" ? readExisting(filePath) : "");
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
    if (!event) return;
    if (event.tool !== "write" && event.tool !== "edit") return;
    inspectToolInput(event.tool, event.input);
  });
}

export default { id: "force-pathlib", setup };
