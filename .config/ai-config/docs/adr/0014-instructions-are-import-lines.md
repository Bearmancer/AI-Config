# One instruction file, `~/.agents/AGENTS.md`, and each harness loads it its own way

Context: Instructions used to live in several files, one per tool, and a repo file was linked or copied into each. Every extra file is a place where the rules disagree.

Decision: `~/.agents/AGENTS.md` is the only instruction content, tracked in the home repo. No other global instruction file holds content: there is no AGENTS.md in the home folder itself, and none beside the OpenCode, Kilo, omo or Cline configs. Doctor reports a second one as drift.

| harness  | how it loads the file                                                                            | proof                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| opencode | `instructions` in `~/.config/opencode/opencode.jsonc` holds `~/.agents/AGENTS.md`                | live probe answered from the file                                                              |
| kilo     | `instructions` in `~/.config/kilo/kilo.jsonc` holds `~/.agents/AGENTS.md`                        | live probe answered from the file                                                              |
| cline    | reads `~/.agents/AGENTS.md` natively, with no setting                                            | live probe answered from the file                                                              |
| claude   | `~/.claude/CLAUDE.md` is a single import line that names `~/.agents/AGENTS.md`, and nothing else | live probe answered from the file; the `instructionFiles` setting alone loaded nothing         |
| omo      | NA                                                                                               | senpi reads a global instruction file only from `~/.omo/agent/`; no setting names another path |

omo's cell is NA with that reason. No copy and no link is made to satisfy it. The upstream request for a configurable path is senpi issue #5567, and the cell turns OK when senpi gains the setting.

Each probe asked for a harmless marker line added to the file for the test and removed again, run from a folder with no project instruction file, so the answer could only come from the global file.

Alternatives rejected: a copy of the instructions in omo's agent folder (a second copy that drifts); a link there (no links anywhere, see [0001](0001-repo-is-master.md)); a per-harness instruction file (the rules disagree within a month).

## Consequences

- Editing the rules is one edit in one file, and `git pull` carries it everywhere.
- Claude Code's `~/.claude/CLAUDE.md` is the only other tracked instruction path, and it holds the import line only.
- omo does not see the rules until senpi gains the setting.
