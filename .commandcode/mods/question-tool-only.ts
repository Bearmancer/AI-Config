const TRIGGERS = [
  "open items",
  "unanswered",
  "questions",
  "unresolved",
  "pending",
  "decisions",
];

const DIRECTIVE = "Use question tool alone";

interface PromptPart {
  text?: string;
}

interface PromptEvent {
  sessionID: string;
  prompt?: PromptPart;
}

interface ContextEvent {
  sessionID: string;
  system?: { type: string; text: string }[];
}

interface SessionDomainLike {
  hook: (
    name: string,
    callback: (event: any) => void | Promise<void>,
  ) => Promise<unknown>;
}

interface PluginContextLike {
  session?: SessionDomainLike;
}

const armed = new Map<string, string[]>();

function matched(text: string): string[] {
  const lower = text.toLowerCase();
  return TRIGGERS.filter((trigger) => lower.includes(trigger));
}

async function setup(ctx: PluginContextLike): Promise<void> {
  if (!ctx?.session || typeof ctx.session.hook !== "function") {
    console.log("question-tool-only: no session domain, plugin inactive");
    return;
  }

  console.log(`question-tool-only loaded (triggers: ${TRIGGERS.join(", ")})`);

  await ctx.session.hook("prompt", (event: PromptEvent) => {
    const text =
      typeof event?.prompt?.text === "string" ? event.prompt.text : "";
    if (!text || !event.sessionID) return;
    const hits = matched(text);
    if (hits.length > 0) armed.set(event.sessionID, hits);
  });

  await ctx.session.hook("context", (event: ContextEvent) => {
    if (!event?.sessionID || !Array.isArray(event.system)) return;
    const hits = armed.get(event.sessionID);
    if (!hits) return;
    armed.delete(event.sessionID);
    event.system.push({
      type: "text",
      text: `${DIRECTIVE} (trigger words in the latest user message: ${hits.join(", ")}).`,
    });
  });
}

export default { id: "question-tool-only", setup };
