# Model routing uses each tool's native mechanism, on the Claude 5.5 family only

Context: No tool reads another tool's routing format, so each routes through its own tracked file. Older Claude models and every Opus are retired for this rig, except the google provider's Antigravity Claude ids, which the rig uses as listed.

Decision: Routing uses each tool's own mechanism. omo routes through categories and agents in `~/.omo/omo.jsonc`, each a list of model rungs with a reasoning level. OpenCode Slim routes through presets in `~/.config/opencode/oh-my-opencode-slim.jsonc`. The two keep separate fallback chains, and neither falls back into the other tool. Credentials are never read, printed or committed.

Claude 5.5 family only, no Opus anywhere except the google provider's Antigravity ids:

- omo: `exclude_models` lists every other Claude id, including `*claude-opus*`, so only the sonnet-5-5 and haiku-5-5 ids stay usable.
- OpenCode: `providers.<id>.models.<id>.disabled` hides each older Claude id on the anthropic and claude-agent providers (OpenCode v2 ignores the older `provider` whitelist and blacklist keys). google-vertex is denied wholesale by a `policies` `provider.use` deny — its only provider-level off switch, since a provider entry has no `disabled` field. The google provider carries no per-model disables: its Antigravity Claude ids are used as listed.
- Claude Code: `availableModels` in `~/.claude/settings.json` lists claude-sonnet-5-5 and claude-haiku-5-5, and `model` is claude-sonnet-5-5.

omo also excludes the fable family. No kimi or astra id is used, and no paid Zen id appears in any tracked file.

Slim has three presets. The root preset is `default-free`. `anthropic` runs the orchestrator, oracle and designer on claude-agent/sonnet and the lowest workers on claude-agent/haiku after their free rungs. `paid-mix` mixes paid providers. The lowest workers, explorer, fixer and observer, start with two free rungs in every preset: an opencode Zen free model, then an opencode-go free model. Every seat in every preset ends on an opencode-go rung, so a chain that runs out lands on a provider the owner pays for on purpose.

A rung whose id is not in `opencode models` is left out, never replaced by a guess. Free ids come and go, so the list is rechecked whenever a preset changes.

The main-session pin in omo is `model_profile`. It never affects delegated children.

Alternatives rejected: one shared routing file across tools; a shared tier-to-model table across tools; keeping older Claude ids selectable "just in case".

## Consequences

- Each omo entry repeats its full chain, so a chain change means editing every entry on that chain.
- A preset can end on opencode-go even when an earlier rung would have worked, which is the point.
- Claude Code refuses a model outside `availableModels`.
- Other gateways may still list older Claude ids that this rig does not use; they are disabled where OpenCode lists them, the google provider's used Antigravity ids excepted.
