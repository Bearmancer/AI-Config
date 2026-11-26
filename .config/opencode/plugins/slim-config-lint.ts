import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const target = /(?:^|[\\/])oh-my-opencode-slim\.jsonc?$/i;
const commentsAndCommas = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\/|,(?=\s*[}\]])/g;

type Ref = { id: string; variant?: string };

function references(node: any, found: Ref[] = []): Ref[] {
  if (!node || typeof node !== "object") return found;
  for (const [key, value] of Object.entries(node)) {
    if (key !== "model") references(value, found);
    else if (typeof value === "string") found.push({ id: value, variant: node.variant });
    else if (Array.isArray(value))
      for (const entry of value) found.push(typeof entry === "string" ? { id: entry } : (entry as Ref));
  }
  return found;
}

export function check(text: string, models: any[]): string[] {
  const config = JSON.parse(text.replace(commentsAndCommas, (_, string) => string ?? ""));
  const catalog = new Map<string, string[]>(
    models.map((m) => [`${m.providerID}/${m.id}`, (m.variants ?? []).map((v: any) => (typeof v === "string" ? v : v.id))]),
  );
  const problems: string[] = [];
  for (const { id, variant } of references(config)) {
    const slash = id.indexOf("#");
    const name = slash < 0 ? id : id.slice(0, slash);
    const effort = variant ?? (slash < 0 ? undefined : id.slice(slash + 1));
    const published = catalog.get(name);
    if (!published) problems.push(`${name}: not in the model list`);
    else if (effort && !published.includes(effort))
      problems.push(`${name}: variant "${effort}" not published (valid: ${published.join(", ") || "none"})`);
  }
  return [...new Set(problems)];
}

async function setup(ctx: any) {
  await ctx.tool.hook("execute.after", async (event: any) => {
    if (event.status !== "completed" || (event.tool !== "write" && event.tool !== "edit")) return;
    const path = event.input?.path;
    if (typeof path !== "string" || !target.test(path)) return;
    const file = isAbsolute(path) ? path : resolve(ctx.location.directory, path);
    const listed = await ctx.model.list();
    const models = Array.isArray(listed) ? listed : listed.data;
    const problems = check(readFileSync(file, "utf8"), models);
    if (problems.length)
      throw new Error(`slim-config-lint: ${file} was saved as written but has invalid models. Fix them:\n${problems.join("\n")}`);
  });
}

export default { id: "slim-config-lint", setup };
