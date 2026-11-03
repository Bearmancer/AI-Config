# Architecture decisions

Read this table first. Open only the records whose Areas column matches the area you are about to change. Numbers never change and files are never renamed; a decision that changes is rewritten in place and its file states the current decision only. A new record takes the next free number and gets its row here in the same pull request.

| ADR                                                     | Decision                                                                                        | Areas                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [0001](0001-repo-is-master.md)                          | The home repo is the source of truth, and its files are the live files                          | git dir, work tree, allowlist, writers, never-tracked files        |
| [0002](0002-harness-registry-and-tests.md)              | One registry per harness, one test per behavior                                                 | `harnesses.toml`, `scripts/doctor.py`, `tests/`                    |
| [0003](0003-app-rewritten-files.md)                     | Apps that rewrite their own files: track them in place or leave them alone                      | app-owned files, `~/.claude.json`, Cline settings                  |
| [0004](0004-mcp-presets-and-tiers.md)                   | MCP servers: one stanza shape, codegraph enabled everywhere                                     | MCP files, env references, disable flags                           |
| [0005](0005-skills.md)                                  | Skills come only from npx skills; own skills live in a public repo                              | `~/skills-lock.json`, `~/.agents/skills`, Claude Code skills       |
| [0006](0006-secrets-and-gates.md)                       | Secrets live in per-PC environment variables; the commit gate refuses a literal                 | bws, user environment variables, redaction scan                    |
| [0007](0007-status-matrix.md)                           | Doctor prints a 25-cell matrix and never writes                                                 | cells, states, exit code, `--repo-only`                            |
| [0008](0008-memory-mirror.md)                           | Memory mirror: omo owns the push, the home repo owns nothing of it                              | omo memory                                                         |
| [0009](0009-model-routing.md)                           | Model routing uses each tool's native mechanism, on the Claude 5.5 family only                  | omo routing, Slim presets, model hiding                            |
| [0010](0010-routine-runs-never-commit.md)               | Nothing commits on its own                                                                      | commits, schedules, Python via `uv run`                            |
| [0011](0011-lessons-home.md)                            | Lessons have one home each                                                                      | agent lessons, hooks, antipattern doc                              |
| [0012](0012-github-is-the-only-record.md)              | GitHub is the only record                                                                       | issues, pull requests, worktrees                                   |
| [0013](0013-skills-pin-refs-and-gate-memory-restore.md) | The skills lock pins every skill; npx skills is the only writer                                 | `~/skills-lock.json`, the restore command                          |
| [0014](0014-instructions-are-import-lines.md)          | One instruction file, `~/.agents/AGENTS.md`, and each harness loads it its own way              | instruction loading, `~/.claude/CLAUDE.md`, the omo NA cell         |
| [0015](0015-kilo-settings-merge-into-one-file.md)      | Kilo keeps all its settings in one tracked file                                                 | `~/.config/kilo/kilo.jsonc`                                        |
| [0016](0016-no-deprecated-config-keys.md)              | No harness config holds a deprecated key                                                        | every harness config                                               |
| [0017](0017-install-is-one-linear-line.md)             | One path: setup once per PC, then git pull and git push                                         | `scripts/setup.ps1`, `scripts/setup.sh`, the five setup steps      |
| [0018](0018-skills-and-mcp-presets-are-independent.md) | Skills and MCP servers are independent surfaces                                                 | skills cell, mcp cell                                              |
| [0019](0019-no-backup-artifacts.md)                     | No backup artifacts anywhere                                                                    | backup files, undo history                                         |
| [0020](0020-harness-table-owns-files-and-plugins.md)   | A harness table owns its files, and JSON configs are JSONC                                      | `harnesses.toml`, `json_only`, twins                               |

## Citations that are not in this table

Text such as `ADR 0025` inside the skill rigorous-research cites that skill's own decision series, kept in its references folder (design.md) (ADRs 0001-0034). Those numbers do not refer to the files above.
