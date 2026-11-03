# The skills lock pins every skill; npx skills is the only writer

Context: Skills used to arrive from several writers: an ai-config fetcher, a global install and a pin file. Each rewrote folders another one managed, and pins went stale. The rig needs other people's skills on every PC without tracking their code in git, and exactly one tool deciding what is installed.

Decision:

1. `~/skills-lock.json`, written by `npx skills`, is the one record of which skills are installed and where each came from. It is tracked in the home repo. Nothing else holds a pin, a ref or a list of skills.
2. A PC reaches the locked state with `npx skills experimental_install` from the home folder. The setup script runs it once; a later `git pull` that changes the lock is followed by the same command. It reports the skills already installed and installs only the missing ones, and `--force` reinstalls.
3. The command installs to the universal agents only, that is `~/.agents/skills`. That is where omo, OpenCode, Kilo and Cline read, so those four are covered by the one restore. Claude Code reads only `~/.claude/skills`, which the restore never fills; it gets `npx skills add <source> -s <names> -a claude-code -y` per lock source (see [0005](0005-skills.md)).
4. The restore never touches memory, MCP entries or any config file. Memory is omo's own business (see [0008](0008-memory-mirror.md)).
5. No other tool writes a skills folder. A copy outside `~/.agents/skills` and `~/.claude/skills` is a twin and doctor reports it. A skill folder missing from the lock is stale and doctor reports it as drift.
6. Latest only: `npx skills add` takes upstream's HEAD and rewrites the lock hash, and a skill upstream removed is purged with `npx skills remove <name> -y`.

Alternatives rejected: an ai-config-written git fetcher (a second writer and a second cache format); pinning to a recorded commit in the repo's own file (a second pin beside the lock); submodules or subtrees (repo weight and a second update path); copying skill folders into the repo (stale copies).

## Consequences

- What is installed is always traceable to the lock, and the lock is the diff reviewers read.
- A skill added on one PC reaches the others with `git pull` and the restore.
- The restore decides "already installed" by the skill's folder under `~/.agents/skills`, so it never repairs a folder it did not create.
- A folder `npx skills` does not know about is left alone.
