# AI-Config

One git repo keeps the config of six coding tools identical on every PC: omo, OpenCode, Kilo, Cline, Claude Code and Command Code. The repo's git dir is `~/Dev/AI-Config/.git` and its work tree is the home folder, so the tracked files are the live files. There is nothing to install, link or sync. You edit a file where the tool reads it, commit, and the other PCs get it with `git pull`.

Words: `GLOSSARY.md`.

Decisions: `docs/adr/README.md` indexes every record.

## The one path

1. **Once per PC**, run the setup script: `scripts/setup.ps1` on Windows, `scripts/setup.sh` on Linux. It clones the repo into `~/Dev/AI-Config` without a checkout, points the work tree at the home folder, wires the pre-commit hook, saves a report of how the live files differ from the repo, then checks the repo's files out over them. After that it sets the per-PC environment variables the MCP servers need (values come from Bitwarden Secrets Manager through `bws`, and are never printed), restores skills with `npx skills` (a restore plus a Claude Code add, see Skills below), and writes the MCP entries into the two files an app owns, `~/.cline/data/settings/cline_mcp_settings.json` and `~/.claude.json`. It needs git, bws, npx and `BWS_ACCESS_TOKEN`, and it refuses to run a second time.
2. **Every day after**, `git pull` and `git push` are the whole sync. Nothing rewrites a file for you, nothing links one, and no command copies a live file back into the repo.

Git commands use the separate git dir and work tree:

```
git --git-dir=$HOME/Dev/AI-Config/.git --work-tree=$HOME status
```

Only files named in `~/.gitignore` are visible to git. Its first rule is `/*`, so everything else in the home folder stays ignored, and each tracked path is added back by an explicit allowlist line. Stage by explicit path, never `git add .` or `git add -A`.

## Doctor

`ai-config doctor` is `scripts/doctor.py`. It reads `harnesses.yaml` and the live files and prints one row per harness per surface: six harnesses (omo, opencode, kilo, cline, claude, commandcode) by five surfaces (instructions, mcp, skills, config, secrets). Each cell is OK, DRIFT, MISSING, NA or UNKNOWN. It exits 0 only when every cell is OK or NA, and an absent file is never OK. A cell is NA only with a reason read from the harness's own source. Doctor never writes and never prints a secret value.

```
uv run --no-project --with pyyaml python ~/.config/ai-config/scripts/doctor.py
uv run --no-project --with pyyaml python ~/.config/ai-config/scripts/doctor.py --repo-only
uv run --no-project --with pyyaml python ~/.config/ai-config/scripts/doctor.py --json
```

`--repo-only` skips the cells that need a PC's untracked, app-owned files, so CI can run it on a bare checkout.

## The hook

Drift is a hard stop. The pre-commit hook `hooks/pre-commit` runs three things in order, and any failure refuses the commit: the redaction scan of the staged files (`scripts/scan_staged.py`), `ai-config doctor`, and the test suite in `tests/`. Commit through the hook, never with `--no-verify`. The required CI check on the public repo runs the same doctor and suite. Hook scripts and shell scripts are LF on every OS, pinned by `.gitattributes`.

Run the suite by hand:

```
uv run --no-project --with pyyaml --with pytest pytest -q ~/.config/ai-config/tests
```

## Where each surface lives

| surface      | live file                                                                                                                                                                | who writes it                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| instructions | `~/.agents/AGENTS.md`, the only instruction content; `~/.claude/CLAUDE.md` and `~/.commandcode/AGENTS.md` hold import lines only                                   | git                                                        |
| MCP servers  | `~/.omo/agent/mcp.json`, `~/.config/opencode/opencode.jsonc`, `~/.config/kilo/kilo.jsonc`, `~/.commandcode/mcp.json`; untracked: `~/.cline/data/settings/cline_mcp_settings.json`, `~/.claude.json` | git for the tracked files, the setup script for the last two |
| skills       | `~/.agents/skills` and `~/.claude/skills`, both matching `~/skills-lock.json`; Command Code reads `~/.agents/skills`                                                        | `npx skills`                                               |
| config       | the files each harness mapping in `harnesses.yaml` names                                                                                                                   | git, and the app when it rewrites its own file in place    |
| secrets      | per-PC user environment variables                                                                                                                                        | the setup script, from bws                                 |

Never tracked: `~/.claude.json`, `~/.cline/data/**`, the Magic Context database, and any file holding a literal secret.

### Instructions

`~/.agents/AGENTS.md` is the only instruction content. OpenCode and Kilo list it in the `instructions` key of their config, Cline reads it natively, Claude Code loads it through the single import line in `~/.claude/CLAUDE.md`, and Command Code loads `~/.commandcode/AGENTS.md`, which holds only `@~/.agents/AGENTS.md` and `@~/.commandcode/omo-memory.md`. omo is NA: it reads a global instruction file only from `~/.omo/agent/` and has no setting for another path. The upstream request is senpi issue #5567.

`~/.commandcode/omo-memory.md` is generated by the setup script through `scripts/commandcode_memory.py`. It imports OMO's standing memory (`system/*.md` plus `people/human/observations.md`) from the local OMO identity named by `~/.omo/omo.jsonc` `memory.agent`. Doctor re-derives it and reports DRIFT when it is stale. OMO still owns its memory repository; the home repo writes only that import list ([0021](docs/adr/0021-commandcode-surface.md)). Command Code's learned taste profile stays app-managed: no taste file is tracked or edited.

### MCP servers

Ten servers are defined in every harness: agentql, arxiv, codegraph, dappier, exa, firecrawl, paper-search, scrapegraph, tavily and zotero. A stanza has one shape everywhere: a bare command, its args, and an env block that holds only references to environment variables, never a value. OpenCode and Kilo spell the same thing as a command array plus `environment` and `type: local`. Only codegraph is enabled. The other nine stay defined but disabled: `enabled: false` in omo, Kilo and Command Code, `disabled: true` in OpenCode and Cline. Claude Code has no per-server disable flag at user scope, so its file holds codegraph alone. The one literal allowed in a stanza is `ZOTERO_LIBRARY_ID`, a non-secret number.

### Skills

Skills come only from `npx skills`, which records every source in `~/skills-lock.json`. The owner's own skills live in the public repo Bearmancer/skills and reach a PC the same way.

Two folders hold skills. `~/.agents/skills` is the one omo, OpenCode, Kilo, Cline and Command Code read, and `npx skills experimental_install` run from the home folder fills it from the lock. Claude Code reads personal skills only from `~/.claude/skills`, which that command never fills, so Claude's folder is filled with `npx skills add <source> -s <names> -a claude-code -y` for each source in the lock. In non-interactive mode that installs copies, so every lock skill exists in both folders. Claude's `synced` folder is managed by claude.ai and is left alone. The setup script runs both steps, restore first and then one `add` per lock source.

Skills track upstream's current content, latest only. `npx skills add` always installs upstream's HEAD and the lock records the new hash. A skill that upstream removes is purged with `npx skills remove <name> -y`, which drops the lock entry and every skills folder. Doctor checks that every lock skill is present in both folders, and flags any skill folder that is not in the lock as DRIFT (stale skill not in lock), so a stale skill blocks the next commit.

### Models

Only the Claude 5.5 family is available, and no Opus anywhere. omo lists every other Claude id in `exclude_models`, including `*claude-opus*`. OpenCode hides them with `providers.<id>.models.<id>.disabled`. Claude Code limits itself through `availableModels` and starts on `claude-sonnet-5-5`. The routing itself is in `docs/adr/0009-model-routing.md`.

OpenCode Slim has three presets in `~/.config/opencode/oh-my-opencode-slim.jsonc`. The root preset is `default-free`. `anthropic` runs the team on Claude (claude-agent/sonnet and claude-agent/haiku), and `paid-mix` spreads it across paid providers. The lowest workers (explorer, fixer, observer) start with two free rungs, and every seat in every preset ends on an opencode-go rung.

## Free OpenCode ids

Free OpenCode model ids come and go. `opencode models` lists what resolves today; a rung that no longer resolves is removed from the preset, never replaced by a guess.

All Python runs through `uv run`, never bare python.
