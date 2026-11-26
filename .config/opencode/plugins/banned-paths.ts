const homeRaw = process.env.USERPROFILE ?? process.env.HOME ?? "";
const clean = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
const home = clean(homeRaw).replace(/\/+$/, "");

function resolve(value: string, base: string): string {
  const path = clean(value);
  if (path === "~" || path.startsWith("~/")) return home + path.slice(1);
  return /^[a-z]:\//.test(path) || path.startsWith("/") ? path : clean(`${base}/${path}`);
}

const insideHome = (value: string, base: string) => {
  const path = resolve(value, base);
  return !home || path === home || path.startsWith(`${home}/`);
};

const secrets = ["~/.secrets/GitHub.env", "~/.secrets/google_client_secret.json"].map((file) => resolve(file, ""));
const secretNames = secrets.map((file) => file.slice(file.lastIndexOf("/") + 1));
const secretDirs = secrets.flatMap((file) => {
  const dir = file.slice(0, file.lastIndexOf("/"));
  return [dir, dir.replace(home, "~")];
});
const tokens = (text: string) => text.match(/"[^"]*"|'[^']*'|`[^`]*`|[^\s;|&]+/g) ?? [];
const unquote = (token: string) => token.replace(/^(["'`])([\s\S]*)\1$/, "$2");
const mentionsSecret = (text: string) => secretNames.some((name) => clean(text).includes(name));
const globsSecretDir = (text: string) =>
  tokens(text)
    .flatMap((token) => unquote(token).split(/\s+/))
    .some((word) => /[*?[]/.test(word) && secretDirs.some((dir) => clean(word).includes(dir)));

function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .split("\n")
      .filter((line) => !mentionsSecret(line))
      .join("\n");
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrub(inner)]));
}

const pathFlag = /^-(?:path|literalpath|name|outfile|o|filepath|inputfile|errorfile)$/i;
const valueFlag =
  /^-(?:itemtype|type|encoding|value|delimiter|stream|width|filter|include|exclude|erroraction|ea|warningaction|outvariable|ov)$/i;
const createsAll = new Set([
  "mkdir",
  "md",
  "new-item",
  "ni",
  "touch",
  "invoke-webrequest",
  "iwr",
  "curl",
  "wget",
  "invoke-restmethod",
  "irm",
]);
const createsFirst = new Set(["tee", "tee-object", "add-content", "ac", "out-file", "set-content"]);
const moves = new Set(["cp", "copy", "mv", "move", "copy-item", "move-item", "rename-item", "ren"]);

function positional(words: string[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!words[i].startsWith("-")) found.push(unquote(words[i]));
    else if (pathFlag.test(words[i]) && i + 1 < words.length) found.push(unquote(words[++i]));
    else if (valueFlag.test(words[i]) && i + 1 < words.length) i++;
  }
  return found;
}

function commandTargets(command: string): string[] {
  const words = tokens(command);
  const found: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const redirect = /^\d*>>?(.*)$/.exec(words[i]);
    if (redirect) found.push(unquote(redirect[1] || words[++i] || ""));
  }
  const head = words.findIndex((word) => !word.startsWith("$") && word !== "=");
  const verb = (words[head] ?? "").toLowerCase();
  const args = positional(words.slice(head + 1).filter((word) => !/^\d*>>?/.test(word)));
  if (createsAll.has(verb)) found.push(...args);
  if (createsFirst.has(verb)) found.push(...args.slice(0, 1));
  if (moves.has(verb)) found.push(...args.slice(-1));
  return found;
}

const isLocal = (target: string) =>
  !!target &&
  !/^(?:\/dev\/null|nul)$/i.test(target) &&
  !/^[$@({]/.test(target) &&
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(target) &&
  !target.startsWith("//");

function outsideTarget(command: string, base: string): string | undefined {
  const segments = command.match(/(?:"[^"]*"|'[^']*'|`[^`]*`|[^;|&\n])+/g) ?? [];
  return segments.flatMap(commandTargets).find((target) => isLocal(target) && !insideHome(target, base));
}

const outside = (action: string, resources: string[], base: string) =>
  action === "edit"
    ? resources.find((resource) => resource.trim() && !insideHome(resource, base))
    : action === "shell"
      ? resources.map((resource) => outsideTarget(resource, base)).find(Boolean)
      : undefined;

const isProtected = (action: string, resources: string[], base: string) =>
  action === "glob"
    ? resources.some(mentionsSecret)
    : action === "shell"
      ? resources.some((text) => mentionsSecret(text) || globsSecretDir(text))
      : (action === "read" || action === "edit") && resources.some((r) => secrets.includes(resolve(r, base)));

function verdict(action: string, resources: string[], base: string): string | undefined {
  if (isProtected(action, resources, base)) return "Blocked: protected file.";
  const target = outside(action, resources, base);
  return target ? `Blocked: ${target}. Write under ${homeRaw} instead.` : undefined;
}

async function setup(ctx: any) {
  const base = ctx.location.directory;
  await ctx.permission.hook("evaluate", (event: any) => {
    const message = verdict(event.action, event.resources, base);
    if (!message) return;
    event.effect = "deny";
    event.message = message;
  });
  await ctx.tool.hook("execute.after", (event: any) => {
    if (event.status !== "completed" || (event.tool !== "grep" && event.tool !== "glob")) return;
    event.result = scrub(event.result) as typeof event.result;
  });
}

const actions: Record<string, string> = { read: "read", write: "edit", edit: "edit", glob: "glob", bash: "shell" };

async function server(input?: any) {
  const base = input?.directory ?? process.cwd();
  return {
    "tool.execute.before": async (i: any, c: any) => {
      const action = actions[i?.tool];
      const resource = action === "shell" ? c?.args?.command : action === "glob" ? c?.args?.pattern : (c?.args?.filePath ?? c?.args?.path);
      if (!action || typeof resource !== "string") return;
      const message = verdict(action, [resource], base);
      if (message) throw new Error(message);
    },
    "tool.execute.after": async (i: any, c: any) => {
      if ((i?.tool === "grep" || i?.tool === "glob") && c) c.output = scrub(c.output);
    },
  };
}

export default { id: "banned-paths", setup, server };
