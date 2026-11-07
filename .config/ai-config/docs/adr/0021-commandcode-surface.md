# Command Code is a first-class harness; its OMO bridge is generated, never copied

Context: Command Code (`cmdc`) reads skills from `~/.agents/skills`, MCP servers from `~/.commandcode/mcp.json`, and user memory from `~/.commandcode/AGENTS.md`. It also learns a taste profile of its own. The repo managed five harnesses and left Command Code unmanaged, so its instruction file was a drifting copy and its MCP set was empty.

Decision:

- `harnesses.yaml` gains the `commandcode` mapping. The skills cell is the shared `~/.agents/skills`; `~/.commandcode/skills` is never created.
- `~/.commandcode/AGENTS.md` is tracked and holds two imports: `@~/.agents/AGENTS.md` and `@~/.commandcode/omo-memory.md`.
- `~/.commandcode/mcp.json` is tracked and defines the same ten servers as the flag-capable harnesses, with only codegraph enabled and env references in `${VAR}` form. Claude holds codegraph alone.
- `~/.commandcode/settings.json` is tracked. `disabledSkills` is the union of OMO's disabled list and the names the owner already had off, so the mirror never re-enables a skill.
- Setup writes `~/.commandcode/omo-memory.md`, an import-only list of OMO's standing memory (`system/*.md` plus `people/human/observations.md`). The OMO identity is resolved from `~/.omo/omo.jsonc` `memory.agent`, never hard-coded. Doctor re-derives the body and reports DRIFT on stale content.
- Taste stays app-managed. No taste file is tracked or edited; OMO standing preferences reach Command Code as imported memory.

This record supersedes [0008](0008-memory-mirror.md)'s "no cell for memory" clause for this surface only. omo still owns the memory clone and push; the home repo only writes a read-only import list.

Alternatives rejected: `cmd /import` (copies that drift, duplicate the shared skills); setup writing every Command Code file untracked (loses git review for the instruction and MCP surfaces); hand-editing `taste.md` (the product redirects taste-directory writes to the taste tool).

## Consequences

- Doctor prints one more row per surface: six harnesses by five surfaces, 30 cells.
- A PC without an OMO memory repository gets a stable header-only bridge and no DRIFT row; a partial or stale bridge is DRIFT.
- Tracking `settings.json` pins the owner's `dont-ask` permission default on every PC.
