# One instruction file, `~/.agents/AGENTS.md`, and each harness loads it its own way

Context: Instructions used to live in several files, one per tool, and a repo file was linked or copied into each. Every extra file is a place where the rules disagree.

Decision: `~/.agents/AGENTS.md` is the only instruction content, tracked in the home repo. No other global instruction file holds content of its own (the hard link at `~/.omo/agent/AGENTS.md` is the same file instance, not another file): there is no AGENTS.md in the home folder itself, and none beside the OpenCode, Kilo, omo or Cline configs. Doctor reports a second one as drift unless it is the same file instance.

| harness  | how it loads the file                                                                            | proof                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| opencode | `instructions` in `~/.config/opencode/opencode.jsonc` holds `~/.agents/AGENTS.md`                | live probe answered from the file                                                              |
| kilo     | `instructions` in `~/.config/kilo/kilo.jsonc` holds `~/.agents/AGENTS.md`                        | live probe answered from the file                                                              |
| cline    | reads `~/.agents/AGENTS.md` natively, with no setting                                            | live probe answered from the file                                                              |
| claude   | `~/.claude/CLAUDE.md` is a single import line that names `~/.agents/AGENTS.md`, and nothing else | live probe answered from the file; the `instructionFiles` setting alone loaded nothing         |
| omo      | `~/.omo/agent/AGENTS.md` is a hard link to `~/.agents/AGENTS.md` (same file instance)             | doctor `_same_file` proves instance identity; senpi loads the agent dir file as global context |

omo's cell is OK: senpi reads global context from `~/.omo/agent/`, so `~/.omo/agent/AGENTS.md` is a hard link to the one file — the same file instance, not a copy (doctor verifies instance identity with `_same_file`). The upstream request for a configurable path remains senpi issue #5567; a setting would replace the link.

Each probe asked for a harmless marker line added to the file for the test and removed again, run from a folder with no project instruction file, so the answer could only come from the global file.

Alternatives rejected: a copy of the instructions in omo's agent folder (a second copy that drifts); a per-harness instruction file (the rules disagree within a month). A symlink or junction was rejected under [0001](0001-repo-is-master.md)'s no-links rule (repo wiring); a hard link is different — it is the tracked file itself at a second path in app-owned space, needs no admin rights, and doctor proves instance identity rather than string equality.

## Consequences

- Editing the rules is one edit in one file, and `git pull` carries it everywhere.
- Claude Code's `~/.claude/CLAUDE.md` is the only other tracked instruction path, and it holds the import line only.
- omo reads the same rules through the hard link; when senpi gains a configurable path (issue #5567) the link can be removed with a single `Remove-Item`/`rm`.
