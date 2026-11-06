# Environment and Tool Distinctions

- `omo`: Standalone application and runtime directory (`~/.omo`, binary omo.exe).
- `omo plugin for opencode`: Plugin for OpenCode.
- `omc`: `oh-my-claudecode` multi-agent orchestration layer for Claude Code.
- All three are distinct entities.

# Surfaces

- One path per surface. Drift is a hard stop: `ai-config doctor` exits 1 and the commit is refused.
- Drop old legacy linkage and history: no links, redirects or shims for old paths, no imported history; a new repo starts from a fresh commit.
- This file is the only global instruction file. OpenCode and Kilo list it under `instructions`; Cline reads it natively; Claude imports it with one line.
- A harness that cannot read it is marked NA with its reason. No copy, no link, no second instruction file.

# Conventions

- Commits: `type(scope): imperative summary`, one concern per commit.
- Stage by explicit path. Never `git add .` or `-A`.
- Managed JSON is `.jsonc` wherever the tool reads JSONC.
- No deprecated config key, in the repo or live. Owner: "Do not use deprecated keys. Period."
- No duplicate config file: never a `.json` and `.jsonc` of one stem.
- No backup artifact: `.bak`, `.orig`, `.old`, `migration-backup-*`.
- Never print, log or commit a secret value. Report set/unset or length only; never print `BWS_ACCESS_TOKEN`. Secrets come from env references.
- Skills come from `npx skills` only; the inventory is `~/skills-lock.json`.
- Session handoffs go on the Desktop, never in a repo.
- Bare `python`: use `uv run`.
- Never weaken, skip or delete a test to go green.

# Working rules

- Prefer evidence over assumptions: verify before claiming completion.
- Consult official docs before implementing against an SDK, framework or API.
- No fake completion: TODO-style placeholders, `test.skip`/`.only`, stub tests and unimplemented branches are blockers, not evidence.
- Keep edits small; split a diff that touches two concerns.

# Asking the user

- Put a decision question to the user with the question tool: two to four options, the recommended one first.

<!-- CODEGRAPH_START -->

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call: the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely; indexing is the user's decision.

<!-- CODEGRAPH_END -->

## Agent skills

For the AI-Config repo (git folder `~/Dev/AI-Config/.git`, work tree `$HOME`):

### Issue tracker

GitHub issues on `Bearmancer/AI-Config`; always pass `-R Bearmancer/AI-Config`. See `~/.config/ai-config/docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `~/.config/ai-config/docs/agents/triage-labels.md`.

### Domain docs

Single-context: `~/.config/ai-config/GLOSSARY.md` and `~/.config/ai-config/docs/adr/`. See `~/.config/ai-config/docs/agents/domain.md`.
