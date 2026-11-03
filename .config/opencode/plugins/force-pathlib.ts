/**
 * Validates Python scripts created or modified via write/edit tools.
 * Enforces:
 * 1. Must use `pathlib.Path` whenever performing path or file operations.
 * 2. Forbids bare `open(...)` calls without Path.
 * 3. Requires explicit UTF-8 encoding when reading/writing files.
 */
function inspectPythonPathlib(path: string, content: string): void {
  if (typeof path !== "string" || !path.endsWith(".py")) return;
  if (typeof content !== "string" || !content.trim()) return;

  // Check if content does file / path operations
  const fileOpRegex =
    /(?:\b(?:open\s*\(|os\.path\b|os\.listdir\b|os\.walk\b|os\.mkdir\b|os\.makedirs\b|os\.remove\b|os\.unlink\b|shutil\b))/;
  const hasFileOps = fileOpRegex.test(content);

  // Check if pathlib / Path is imported
  const importsPathlib = /(?:from\s+pathlib\s+import|\bimport\s+pathlib\b)/.test(content);

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

function inspectToolInput(tool: string, input: unknown): void {
  if (!input || typeof input !== "object") return;
  const record = input as Record<string, unknown>;

  const filePath = typeof record.path === "string" ? record.path : "";
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

  inspectPythonPathlib(filePath, content);
}

// OpenCode plugin API: https://opencode.ai/docs/plugins (an exported plugin function returning the hooks).
// Only the plugin function is exported: OpenCode treats every exported function as a plugin.
export const ForcePathlib = async () => {
  return {
    "tool.execute.before": async (
      input: { tool: string },
      output: { args?: Record<string, unknown> }
    ) => {
      if (input.tool !== "write" && input.tool !== "edit") return;
      inspectToolInput(input.tool, output?.args);
    },
  };
};
