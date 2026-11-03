# Skills come only from npx skills; own skills live in a public repo

Context: Copied third-party skills drift from upstream, and a second tool that also writes skill folders fights the first. Some skills ship inside a plugin or an app binary and only work next to the tools that come with them.

Decision:

- Skills reach a PC only through `npx skills`. Every skill it installs is recorded in `~/skills-lock.json`, which is tracked. The setup script restores them with `npx skills experimental_install`, run from the home folder, into `~/.agents/skills`. That folder is the one omo, OpenCode, Kilo and Cline read, so no harness has a second skills folder.
- Own skills are written by the owner and published in the public repo Bearmancer/skills. They are installed with `npx skills` like any external skill and appear in the lock. Their issues live in that repo.
- Nothing else writes a skills folder: no link, no copy, no fetch script. A copy under a harness's own skills path other than the two folders above is a twin, and doctor reports it as drift.
- Outside this decision: plugin skills (oh-my-claudecode, oh-my-opencode-slim), omo runtime skills, and app built-in or synced skills. None is installed or tracked here.
- Claude Code loads personal skills only from `~/.claude/skills`, which `npx skills experimental_install` never fills (it installs to the universal agents, that is `~/.agents/skills`). Claude's folder is filled with `npx skills add <source> -s <names> -a claude-code -y` for each source in the lock. In non-interactive mode that installs copies, so every lock skill exists in both folders. Claude's `synced` folder is claude.ai-managed and excluded from every check. The setup script runs both steps, restore first and then one `add` per lock source.
- Skills track upstream's current content, latest only. `npx skills add` always installs upstream's HEAD and the lock records the new computedHash. A skill removed upstream is purged with `npx skills remove <name> -y`, which drops the lock entry and every skills folder. Doctor checks that every lock skill is present in `~/.agents/skills` and `~/.claude/skills`, and flags a skill folder that is not in the lock as DRIFT (stale skill not in lock). A stale skill therefore blocks the commit until it is purged.

Alternatives rejected: copying externals into the repo (stale copies with no update path); an ai-config-written fetcher beside `npx skills` (two writers for one folder); one repo per skill (many remotes to keep); installing plugin skills through the lock (they would load without their tools).

## Consequences

- `npx skills` is the only way to add, update or remove a skill, and the lock records the result.
- Editing an own skill is an edit in Bearmancer/skills followed by an `npx skills` update on each PC.
- Removing a plugin removes its skills; this repo is not involved.
- Purging a stale skill is one command, and the lock diff shows it.
- The lock is tracked, so a skill added on one PC reaches the others with `git pull` and the next restore.
