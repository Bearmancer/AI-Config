# One path: setup once per PC, then git pull and git push

Context: An installer once grew flags, steps, locks and three output styles, and became a different program per run. Setting up a whole rig needs a path that is the same on every PC and leaves nothing to decide.

Decision: There is exactly one path. Run the setup script once per PC, `scripts/setup.ps1` on Windows or `scripts/setup.sh` on Linux, with the repo's remote and an optional branch (default main). After that the only sync is `git pull` and `git push`. The script refuses to run when `~/Dev/AI-Config/.git` already exists. It needs git, bws, npx, uv and `BWS_ACCESS_TOKEN`, and it has seven steps in this fixed order:

1. Clone the remote with `--no-checkout` into `~/Dev/AI-Config`, set `core.worktree` to the home folder, turn `status.showUntrackedFiles` off, and set `core.hooksPath` to `~/.config/ai-config/hooks` so the pre-commit hook guards every commit.
2. Save `git diff` of the live files against the repo as a report in `~/Dev/AI-Config`, then `git checkout -f` the branch. The report can hold secrets, so it is read and deleted.
3. Set the per-PC user environment variables the MCP stanzas reference, from one `bws secret list` (see [0006](0006-secrets-and-gates.md)).
4. Restore skills with `npx skills experimental_install` from the home folder (see [0013](0013-skills-pin-refs-and-gate-memory-restore.md)), then add every lock skill for Claude Code with one `npx skills add <source> -s <names> -a claude-code -y` per lock source (see [0005](0005-skills.md)).
4b. Wire `~/.omo/agent/AGENTS.md` as a hard link to `~/.agents/AGENTS.md`, so senpi's global instruction file is the same file instance (see [0014](0014-instructions-are-import-lines.md)).
5. Generate `~/.commandcode/omo-memory.md`, the import-only bridge to OMO standing memory, through `scripts/commandcode_memory.py` (see [0021](0021-commandcode-surface.md)).
6. Write the ten-server MCP set into the two app-owned files, `~/.cline/data/settings/cline_mcp_settings.json` and `~/.claude.json`, and nothing else in them.

The script takes no other flags. A failing step stops it with one line naming the cause; nothing is rolled back, and every step does nothing when already satisfied. No other command installs, links, syncs or repairs anything. `ai-config doctor` says what is wrong, and the pre-commit hook stops a commit while anything is (see [0007](0007-status-matrix.md)).

Alternatives rejected: a flagged installer with a dry run (a second code path that drifts from the real one); a recurring sync job (it commits unread changes, see [0010](0010-routine-runs-never-commit.md)); a separate step per harness (the harnesses share every surface).

## Consequences

- A new PC is one script run and one `git pull` away from the others.
- Setup is not repeatable by design. A repair is a `git` command, or deleting the repo folder and starting over.
- The script is the only writer of environment variables and of the app-owned MCP entries.
