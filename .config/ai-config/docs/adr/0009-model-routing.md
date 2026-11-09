# Model routing uses each tool's native mechanism, on the Claude 5.5 family only

Context: No tool reads another tool's routing format, so each routes through its own tracked file. Older Claude models and every Opus are retired for this rig. No Google, Gemini or Antigravity provider is configured or used as a fallback.

Decision: Routing uses each tool's own mechanism. omo routes through categories and agents in `~/.omo/omo.jsonc`, each a list of model rungs with a reasoning level. OpenCode Slim routes through presets in `~/.config/opencode/oh-my-opencode-slim.jsonc`. The two keep separate fallback chains, and neither falls back into the other tool. Credentials are never read, printed or committed.

Claude 5.5 family only. `claude-opus-5-5` is allowed only inside Claude Code's `availableModels`, never as the default:

- omo: `exclude_models` lists every other Claude id, including `*claude-opus*`, so only the sonnet-5-5 and haiku-5-5 ids stay usable. It also excludes the fable family, and `opencode-go/kimi-*`.
- OpenCode: `providers.<id>.models.<id>.disabled` hides each older Claude id on the anthropic and claude-agent providers (OpenCode v2 ignores the older `provider` whitelist and blacklist keys). google-vertex is denied wholesale by a `policies` `provider.use` deny — its only provider-level off switch, since a provider entry has no `disabled` field. No google, gemini or antigravity provider entry exists.
- Claude Code: `availableModels` in `~/.claude/settings.json` lists claude-sonnet-5-5 and claude-haiku-5-5, and `model` is claude-sonnet-5-5. `claude-opus-5-5` stays selectable but is not the default.

No kimi or astra id is used, and no paid Zen id appears in any tracked file.

OpenCode's standing default model is `commandcode/deepseek/deepseek-v4.1-flash`. Its `build` and `plan` agents use `opencode-go/beam-free`. Magic Context's historian chain uses `commandcode/deepseek/deepseek-v4.1-flash` (the paid Go muse and Google gemini rungs were dropped).

The CommandCode provider block whitelists only `deepseek/deepseek-v4.1-flash` and `meta/muse-spark-1.3-contributor` (69 ids disabled). OpenCode Go disables its 27 paid ids, leaving `deepseek-v4.1-flash`, `muse-spark-1.3-contributor` and all free ids enabled.

Slim has three presets plus one custom council preset. The active root preset is `free`. `anthropic` runs Anthropic models alone: claude-agent/sonnet (with claude-agent/haiku as the family-native fallback) for the judgment seats, claude-agent/haiku alone for the fast seats. `paid` is free-first (opencode Zen free, then opencode-go free) with commandcode rungs after (deepseek for implementation judgment, muse-spark for the fast and research seats) and alibaba qwen3.8-flash as the final fallback. The custom `default` preset is `paid-council`: five councillor seats (alpha code quality, beta architecture, gamma security, delta performance, epsilon integration/data/reliability), each on opencode/glm-5.3-flash-free, opencode-go/beam-free, commandcode/deepseek/deepseek-v4.1-flash, alibaba-token-plan/qwen3.8-flash, and it is the `default_preset`.

The lowest workers (explorer, fixer, observer) start with two free rungs in every preset that has them: an opencode Zen free model, then opencode-go/beam-free. Every seat in every preset ends on an opencode-go rung (free/paid) or alibaba rung (paid council), so a chain that runs out lands on a provider the owner pays for on purpose.

A rung whose id is not in `opencode models` is left out, never replaced by a guess. Free ids come and go, so the list is rechecked whenever a preset changes.

The main-session pin in omo is `model_profile`. It never affects delegated children.

Alternatives rejected: one shared routing file across tools; a shared tier-to-model table across tools; keeping older Claude ids selectable "just in case".

## Consequences

- Each omo entry repeats its full chain, so a chain change means editing every entry on that chain.
- A preset can end on opencode-go even when an earlier rung would have worked, which is the point.
- Claude Code refuses a model outside `availableModels`.
- Other gateways may still list older Claude ids that this rig does not use; they are disabled where OpenCode lists them.
- Free models are never disabled (see [0024](0024-never-disable-free-models.md)).