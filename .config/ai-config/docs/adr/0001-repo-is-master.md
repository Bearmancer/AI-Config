# The home repo is the source of truth, and its files are the live files

Context: Each harness reads its config from its own folder under the home directory. If the repo is a separate folder that mirrors them, there are two copies and a step that syncs them, and that step can silently lose an edit or leave a PC behind.

Decision: The repo's git dir is `~/Dev/AI-Config/.git` and its work tree is the home folder (`core.worktree`, with `status.showUntrackedFiles` off). A tracked file is the live file itself, at the path its tool reads. Nothing is linked, copied or generated into place. A PC stays in line with `git pull` and `git push`, and the setup script runs once per PC to put the repo in place (see [0017](0017-install-is-one-linear-line.md)).

`~/.gitignore` is an allowlist. Its first rule `/*` ignores the whole home folder, and each tracked path is re-included by an explicit line, directory by directory. A file the allowlist does not name is invisible to git, which is how app state, caches and other repos under the home folder stay out.

Only four writers may create or change a file: git (tracked files), `npx skills` (skills), the harness itself, and the one-shot setup script (environment variables and the MCP entries in untracked app-owned files). Nothing else writes config.

Never tracked: `~/.claude.json`, `~/.cline/data/**`, the Magic Context database, login, token and auth files, and any file that holds a literal secret.

A fresh repo starts from a clean commit. No history is imported from an earlier layout, and no link, redirect or shim is kept for an old path; a former link becomes a regular file and is not re-created.

Alternatives rejected: a separate checkout with files linked or copied into place (a second copy and a sync step); a tool that rewrites live files from the repo (a second writer that fights the apps); keeping history from the old layout (it carries the old model with it).

## Consequences

- Every PC has the same tracked files after `git pull`, and a live edit is a git diff the moment it is made.
- An app that rewrites its own tracked file in place shows up as a change to review and commit (see [0003](0003-app-rewritten-files.md)).
- Staging is by explicit path; `git add .` and `git add -A` are never used.
- Drift is a hard stop at commit time (see [0007](0007-status-matrix.md)).
