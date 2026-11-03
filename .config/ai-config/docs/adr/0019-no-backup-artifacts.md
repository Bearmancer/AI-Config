# No backup artifacts anywhere

Context: [0001](0001-repo-is-master.md) says the repo is the record, and git history is the only undo for a tracked file. A `.bak` copy beside a live file is a second copy that can hold a secret and that nobody reads.

Decision: Nothing this repo owns writes a backup. The allowlist (`/*` first) keeps every `*.bak`, `*.orig`, `*.old` and `migration-backup-*` file out of git, so a stray one is never tracked. The setup script's report of live files against the repo is the one temporary artifact; it is deleted after review. omo writes `omo.jsonc.bak.<ts>` and `migration-backup-<ts>` beside its config when it migrates and cannot be told not to, so those are deleted by hand when seen.

`~/.local/share/opencode/snapshot` is OpenCode's own snapshot store, which is its undo history and not a copy of the owner's files, so it is exempt. OpenCode's and Kilo's undo history stays at each app's default. Cline's checkpoints are opt-in and stay off by the product's default; the VS Code extension's `cline.enableCheckpoints` is a different surface and is not managed here.

Alternatives rejected: leaving omo's copies because they are "not ours" (they are copies of secrets-bearing config); a script that sweeps them (a second writer, and a deleter at that).

## Consequences

- To undo a change to a tracked file, use git.
- A backup file that appears is a thing to delete, never to commit.
