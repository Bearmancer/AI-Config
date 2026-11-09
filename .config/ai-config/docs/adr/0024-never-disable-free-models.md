# Free models are never disabled

Context: The owner ruled on 2026-11-09 that every free model stays reachable on every provider. Paid models are hidden by allowlist (see [0009](0009-model-routing.md)), and a careless whitelist once dropped `crouton-alpha-free` from omo's opencode-go list.

Decision: No tracked config disables, excludes or omits a free model. A free id is one whose name ends in `-free`, or one its provider lists at no cost (OpenCode Zen and OpenCode Go free ids). Where a tool hides models by whitelist, the whitelist names every free id. Where it hides by blacklist, no free id appears in it. A new free id a provider adds is added to the whitelist in the change that notices it.

Alternatives rejected: whitelisting only the ids currently in use (it silently drops a free id the chains may need later); disabling free ids to keep the list short.

## Consequences

- omo `models.json` lists `beam-free`, `crouton-alpha-free` and `iceman-contributor-free` for opencode-go.
- `opencode.jsonc` carries no `disabled` entry for a free id.
- Reviewers check any whitelist or exclude edit against this rule.