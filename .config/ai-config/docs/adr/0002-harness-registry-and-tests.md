# One registry per harness, one test per behavior

Context: Knowledge about each harness once spread across several modules, so adding a tool meant touching all of them, and a check could disagree with the code it was checking.

Decision: `harnesses.yaml` is the only registry, and `scripts/doctor.py` is its only reader. It holds one mapping per harness (omo, opencode, kilo, cline, claude, commandcode) with four cells: `instructions` (the global instruction file the harness loads), `mcp` (the file that carries its MCP servers), `skills` (the folder it reads skills from) and `files` (every other config file it owns). Doctor derives its five surfaces from them: instructions, mcp, skills, config and secrets.

A cell is a mapping. `path` is a live path. `tracked` says whether the file is committed or app-owned. `na` replaces `path` with the reason the cell does not apply, so a gap is always a statement and never an omission. `json_only` marks a file that must stay `.json` and gives the reason (see [0020](0020-harness-table-owns-files-and-plugins.md)). `optional` marks a file that may be absent on a PC. A `shared` mapping holds the rules every harness's MCP cell obeys.

`tests/` holds one test per stated behavior plus every safety invariant: a missing file is never OK, a secret value is never printed, the redaction scan finds what it should. A test is removed only when a caught mutation shows the remaining tests still guard its behavior. No test is skipped or weakened, and none pins prose.

Alternatives rejected: per-harness modules (copies of the same logic); harness knowledge in each caller (every new harness edits many files); deleting tests by coverage numbers alone (coverage passes while behavior goes unguarded).

## Consequences

- Adding a harness is adding one table.
- Doctor and the tests read the same registry, so they cannot disagree about a path.
- The suite runs in the pre-commit hook, so it has to stay fast enough that nobody skips it.
