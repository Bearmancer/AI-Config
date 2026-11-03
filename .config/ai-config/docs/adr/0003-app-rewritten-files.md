# Apps that rewrite their own files: track them in place or leave them alone

Context: Some live files are rewritten by the app that owns them, on save or on exit. The repo cannot stop that, and it should not try.

Decision: A tracked file that an app rewrites is still the live file. When the app changes it, `git diff` shows the change; the owner reads it, then commits it or reverts it. No command copies a live file anywhere, and no second copy exists to fall behind. The pre-commit hook scans the staged content for secrets before it can enter history (see [0006](0006-secrets-and-gates.md)).

Files an app owns outright are left to the app and never tracked: `~/.claude.json`, `~/.cline/data/settings/cline_mcp_settings.json` and the Magic Context database. The setup script writes only the MCP entries into the first two, through the same function for both, and touches no other key. The database is data, not config, and no cell reads it.

A tracked app-rewritten file is kept in the form its app writes. The repo does not reformat it, so the app's next save does not produce a noisy diff.

Alternatives rejected: a mirror copy plus a command that refreshes it (a second copy and a command someone has to remember to run); forcing a link (the app rewrites through it and the link would not hold); tracking the app-owned files (they hold state and per-PC data that differ on every machine).

## Consequences

- An app-written change to a tracked file is a diff to review, never a silent edit.
- Doctor compares parsed JSON, so key order and whitespace are not drift.
- If an app begins to write a secret into a tracked file, the redaction scan refuses the commit.
