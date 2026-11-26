const gates: ReadonlyArray<readonly [string, RegExp]> = [
  ["a prose question", /\?(?=\s|$)/],
  [
    "an offer to do more work",
    /\b(?:want me to|shall i|should i|would you like me to|would you like|let me know|say the word|if you(?:'d| would)? like|i can also|i could also|happy to|i am happy to)\b/i,
  ],
  [
    "a suggestion or optional next step",
    /\b(?:you could|you can also|you might|you may want|consider\b|next steps?\b|optionally|i(?:'d| would)? recommend|my recommendation)\b/i,
  ],
  [
    "an open question or unresolved matter",
    /\b(?:open questions?\b|unresolved\b|tbd\b|to decide\b|up to you\b|pending decision)\b/i,
  ],
  [
    "an unstated decision",
    /\b(?:i decided|i chose|i went with|i assumed|i have defaulted to|i defaulted to|defaulted to|i picked|i opted for)\b/i,
  ],
];

const fence = /(?:```|~~~)[\s\S]*?(?:(?:```|~~~)|$)/g;
const inline = /`[^`\n]*`/g;
const quoted = /"(?:[^"\n]|\\")*"/g;
const quotedSingle = /(?<![\w])'(?:[^'\n]|\\')*'(?![\w])/g;
const blockquote = /^\s{0,3}>.*$/gm;
const url = /https?:\/\/\S+/g;

function proseOnly(text: string): string {
  return text
    .replace(fence, " ")
    .replace(inline, " ")
    .replace(quoted, " ")
    .replace(quotedSingle, " ")
    .replace(blockquote, " ")
    .replace(url, " ");
}

export function detectViolation(text: string): string | undefined {
  const prose = proseOnly(text);
  if (!prose.trim()) return undefined;
  for (const [kind, pattern] of gates) {
    if (pattern.test(prose)) return kind;
  }
  return undefined;
}

type MessageInfo = { id?: string; role?: string; time?: { created?: number } };
type MessagePart = { type?: string; text?: string };
type SessionMessage = { info?: MessageInfo; parts?: readonly MessagePart[] };

function latestAssistant(messages: unknown): { key: string; text: string } | undefined {
  if (!Array.isArray(messages)) return undefined;
  let best: { key: string; text: string; created: number } | undefined;
  for (const raw of messages as SessionMessage[]) {
    if (!raw || raw.info?.role !== "assistant") continue;
    const created = raw.info.time?.created ?? 0;
    if (best && created < best.created) continue;
    const text = Array.isArray(raw.parts)
      ? raw.parts
          .filter((part) => part?.type === "text" && typeof part.text === "string")
          .map((part) => part.text as string)
          .join("\n")
      : "";
    best = { key: raw.info.id ?? text, text, created };
  }
  return best ? { key: best.key, text: best.text } : undefined;
}

const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

function messageFor(kind: string): string {
  return `Blocked by question-gate: ${kind}. Rewrite the reply with the question tool: every question, offer, suggestion and unstated decision becomes one question-tool call with a recommended option and a one-line reason.`;
}

export default {
  id: "question-gate",
  async setup(ctx: {
    location: { directory: string };
    session: {
      context(input: { sessionID: string }): Promise<unknown>;
      get(input: { sessionID: string }): Promise<{ parentID?: string; location?: { directory?: string } }>;
      prompt(input: { sessionID: string; text: string }): Promise<unknown>;
    };
    event: { subscribe(options: { signal: AbortSignal }): AsyncIterable<unknown> };
  }) {
    const strikes = new Map<string, { count: number; at: number }>();
    const nudged = new Map<string, string>();
    const window = 10 * 60 * 1000;
    const controller = new AbortController();
    void (async () => {
      for await (const value of ctx.event.subscribe({ signal: controller.signal })) {
        const event = value as {
          type?: string;
          properties?: { sessionID?: unknown };
          data?: { sessionID?: unknown };
        };
        if (event.type !== "session.idle") continue;
        const sessionID = event.properties?.sessionID ?? event.data?.sessionID;
        if (typeof sessionID !== "string") continue;
        const record = strikes.get(sessionID);
        if (record && record.count >= 2 && Date.now() - record.at < window) continue;
        const session = await ctx.session.get({ sessionID }).catch(() => undefined);
        if (session?.parentID) continue;
        const directory = session?.location?.directory;
        if (directory && normalize(directory) !== normalize(ctx.location.directory)) continue;
        const messages = await ctx.session.context({ sessionID }).catch(() => undefined);
        const reply = latestAssistant(messages);
        if (!reply || !reply.text.trim()) continue;
        if (nudged.get(sessionID) === reply.key) continue;
        const kind = detectViolation(reply.text);
        if (!kind) continue;
        nudged.set(sessionID, reply.key);
        strikes.set(sessionID, { count: (record?.count ?? 0) + 1, at: Date.now() });
        await ctx.session.prompt({ sessionID, text: messageFor(kind) }).catch(() => undefined);
      }
    })();
    return () => controller.abort();
  },
};
