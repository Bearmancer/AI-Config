const ENV_NAME = /^\.env([A-Za-z0-9_.-]*)$/i;
const ENV_MENTION = /\.env(?![A-Za-z0-9_])/i;
const PASSTHROUGH = new Set(["example", "sample", "template"]);
const REDACTED = "[redacted]";

function strings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || out.length > 200) return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value))
    for (const item of value) strings(item, out, depth + 1);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) strings(item, out, depth + 1);
  return out;
}

function basenameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}

function isGuardedEnvName(name: string): boolean {
  const m = name.match(ENV_NAME);
  if (!m) return false;
  const suffix = m[1].replace(/^\.+/, "").toLowerCase();
  return !PASSTHROUGH.has(suffix);
}

function targetsEnvFile(input: unknown): boolean {
  return strings(input).some((s) => isGuardedEnvName(basenameOf(s)));
}

function mentionsEnv(input: unknown): boolean {
  return strings(input).some((s) => ENV_MENTION.test(s));
}

function stripEnvContent(text: string): string {
  const out: string[] = [];
  let openQuote: string | null = null;
  for (const line of text.split("\n")) {
    if (openQuote) {
      const closed = line.includes(openQuote);
      out.push(REDACTED);
      if (closed) openQuote = null;
      continue;
    }
    const at = line.search(/[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*\S/);
    if (at < 0) {
      out.push(line);
      continue;
    }
    const m = line
      .slice(at)
      .match(/^([A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*)(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    out.push(line.slice(0, at) + m[1] + REDACTED);
    const value = m[2].trim();
    const q = value[0];
    if ((q === '"' || q === "'") && !(value.length > 1 && value.endsWith(q)))
      openQuote = q;
  }
  return out.join("\n");
}

function stripLineAssignments(line: string): string {
  return line.replace(
    /([A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*)(?=\S).*/,
    `$1${REDACTED}`,
  );
}

function stripAllAssignments(text: string): string {
  return text.split("\n").map(stripLineAssignments).join("\n");
}

function stripEnvLineMentions(text: string): string {
  return text
    .split("\n")
    .map((line) => (ENV_MENTION.test(line) ? stripLineAssignments(line) : line))
    .join("\n");
}

function redactTree(value: unknown, redact: (text: string) => string): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value))
    return value.map((item) => redactTree(item, redact));
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
      copy[key] = redactTree(item, redact);
    return copy;
  }
  return value;
}

interface ToolEventLike {
  tool?: string;
  input?: unknown;
  status?: string;
  result?: unknown;
  error?: { message?: string } & Record<string, unknown>;
}

function baseToolName(tool: string): string {
  const cut = tool.lastIndexOf("_");
  return cut > 0 ? tool.slice(cut + 1) : tool;
}

async function setup(ctx: {
  tool?: {
    hook: (name: string, cb: (e: ToolEventLike) => void) => Promise<unknown>;
  };
}): Promise<void> {
  if (!ctx?.tool || typeof ctx.tool.hook !== "function") return;

  await ctx.tool.hook("execute.after", (event) => {
    if (!event || typeof event.tool !== "string") return;
    const base = baseToolName(event.tool);
    if (base !== "read" && base !== "shell" && base !== "grep") return;

    try {
      let redact: ((text: string) => string) | undefined;
      if (base === "read") {
        if (targetsEnvFile(event.input)) redact = stripEnvContent;
      } else if (base === "shell") {
        if (mentionsEnv(event.input)) redact = stripEnvContent;
      } else {
        redact = stripEnvLineMentions;
      }
      if (!redact) return;

      if (event.status === "completed") {
        if (event.result !== undefined)
          event.result = redactTree(event.result, redact);
      } else if (event.status === "error" && event.error) {
        const errRedact =
          base === "read" || base === "shell" ? stripAllAssignments : redact;
        event.error.message = String(
          redactTree(event.error.message ?? "", errRedact),
        );
      }
    } catch {
      const withheld = `[env-guard] refused to return .env content: redaction failed (${event.tool})`;
      if (event.status === "completed") event.result = { content: withheld };
      else if (event.error) event.error.message = withheld;
    }
  });
}

export default { id: "env-guard", setup };
