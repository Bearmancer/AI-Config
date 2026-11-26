import { readFileSync } from "node:fs";
const OPS = /(?:\b(?:open\s*\(|os\.path\b|os\.listdir\b|os\.walk\b|os\.mkdir\b|os\.makedirs\b|os\.remove\b|os\.unlink\b|shutil\b))/;
const HAS_PATHLIB = /(?:from\s+pathlib\s+import|\bimport\s+pathlib\b)/;
const BARE_OPEN = /(?<!\.)\bopen\s*\(/;
function check(path: string, content: string, existing = ""): void {
  if (typeof path !== "string" || !path.endsWith(".py")) return;
  if (typeof content !== "string" || !content.trim()) return;
  if (OPS.test(content) && !HAS_PATHLIB.test(`${content}\n${existing}`)) throw new Error(`[Policy Violation: python-pathlib-guard]\nPython script '${path}' performs file/path operations but does not import 'pathlib'.\nRaw string path operations are forbidden due to Windows backslash parsing traps.\n\nRemediation:\n1. Import Path: from pathlib import Path\n2. Read files: Path(p).read_text(encoding="utf-8")\n3. Write files: Path(p).write_text(content, encoding="utf-8")\n4. Paths: Use Path(r'C:\\...') or forward slashes Path('C:/...')`);
  if (BARE_OPEN.test(content)) throw new Error(`[Policy Violation: python-pathlib-guard]\nPython script '${path}' uses bare 'open()'. Use 'pathlib.Path' methods with explicit UTF-8 encoding.\nBare open() calls without explicit encoding suffer from Windows UTF-16LE / cp1252 corruption.\n\nRemediation:\n1. Import Path: from pathlib import Path\n2. Read files: Path(p).read_text(encoding="utf-8")\n3. Or stream: Path(p).open("r", encoding="utf-8")`);
}
function inspect(tool: string, input: unknown): void {
  if (!input || typeof input !== "object") return;
  const r = input as Record<string, unknown>;
  const p = typeof r.filePath === "string" ? r.filePath : typeof r.path === "string" ? r.path : "";
  if (!p.endsWith(".py")) return;
  const content = tool === "write" ? (typeof r.content === "string" ? r.content : "") : tool === "edit" ? (typeof r.newString === "string" ? r.newString : "") : "";
  let existing = "";
  if (tool === "edit") try { existing = readFileSync(p, "utf8"); } catch {}
  check(p, content, existing);
}
async function setup(ctx: any) {
  if (typeof ctx?.tool?.hook !== "function") return;
  await ctx.tool.hook("execute.before", (e: any) => { if (e?.tool === "write" || e?.tool === "edit") inspect(e.tool, e.input); });
}
async function server() {
  return { "tool.execute.before": async (i: any, c: any) => { if (i?.tool === "write" || i?.tool === "edit") inspect(i.tool, c?.args); } };
}
export default { id: "force-pathlib", setup, server };
