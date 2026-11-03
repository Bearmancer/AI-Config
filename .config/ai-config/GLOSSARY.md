---
documentLanguage: en
---

# AI-Config Glossary

AI-Config keeps omo, OpenCode, Kilo, Cline and Claude Code configured from one git repo whose work tree is the home folder. The tracked files are the live files. One place to edit, nothing drifting.

## Harnesses

**Harness**:
One of the five tools ai-config keeps in line: omo, opencode (OpenCode with Slim), kilo (the Kilo CLI, an OpenCode fork), cline (the Cline CLI) and claude (Claude Code).
_Avoid_: Consumer, plugin, tool

**Harness table**:
The one entry in `harnesses.toml` that owns everything about a harness: its instruction file, its MCP file, its skills folder and its other config files.
_Avoid_: Target row, preset

**OMO**:
The omo harness, a separate coding tool with its own agent folder, routing file and extensions.
_Avoid_: Slim, omo memory repo

**Slim**:
oh-my-opencode-slim, the OpenCode plugin that routes roles to models. Its config is tracked here; the plugin's own files are not.
_Avoid_: OMO

**Preset**:
A named team of model chains in Slim's config. The root preset is `default-free`; `anthropic` and `paid-mix` sit beside it.
_Avoid_: Tier, profile

**Seat**:
One Slim role (orchestrator, oracle, designer, explorer, fixer, observer) and its ordered list of model rungs. Every seat ends on an opencode-go rung.
_Avoid_: Agent, slot

## The repo

**Home repo**:
The git repo whose git dir is `~/Dev/AI-Config/.git` and whose work tree is the home folder. It tracks live files in place.
_Avoid_: Clone, checkout, mirror

**Allowlist**:
`~/.gitignore`. Its first rule `/*` ignores the whole home folder, and each tracked path is added back by an explicit line.
_Avoid_: Ignore file, whitelist

**Live file**:
A file at the path its tool reads. When it is tracked, the live file is the repo file: there is no second copy.
_Avoid_: Consumer, target, mirror

**Tracked file**:
A live file that the allowlist admits and git versions.
_Avoid_: Managed file, linked file

**App-owned file**:
A live file an app writes and ai-config never tracks, such as `~/.claude.json` or the Cline settings file. The setup script writes only its MCP entries.
_Avoid_: Built file, copied file

**Setup script**:
`scripts/setup.ps1` or `scripts/setup.sh`. It runs once per PC: clone, checkout, environment variables from bws, skills restore and Claude Code add, app-owned MCP entries. Day-to-day sync is `git pull` and `git push`.
_Avoid_: Installer, sync

## Doctor and the hook

**Doctor**:
`scripts/doctor.py`. It reads the registry and the live files, prints the matrix and writes nothing.
_Avoid_: Status, checker

**Registry**:
`harnesses.toml`, the one file doctor reads to learn which live path each harness uses for each surface.
_Avoid_: Config, manifest

**Surface**:
A kind of thing a harness has: instructions, mcp, skills, config or secrets. Doctor prints one column per surface.
_Avoid_: Unit, target

**Cell**:
One harness by one surface. Five harnesses and five surfaces make 25 cells.
_Avoid_: Row, check

**State**:
A cell's result: OK, DRIFT (present but wrong), MISSING (absent, never OK), NA (the harness cannot take the surface, with a reason read from its source) or UNKNOWN (the check itself failed). Doctor exits 0 only when every cell is OK or NA.
_Avoid_: Status, health

**Pre-commit hook**:
`hooks/pre-commit`. It runs the redaction scan, doctor and the test suite, and any failure refuses the commit. It is the hard stop for drift.
_Avoid_: Git hook (when meaning an agent guard), CI

**Redaction scan**:
`lib/redaction.py` run over staged files by `scripts/scan_staged.py`. A finding is reported as `path:line (class)`, never as a value.
_Avoid_: Secret gate, lint

**JSON-only file**:
A config whose tool loads no `.jsonc` of that stem, so it keeps its `.json` name. Its entry in the registry carries a probed reason. Every other JSON config is `.jsonc`.
_Avoid_: Exception file

**Twin**:
The `.json` file beside a `.jsonc` of the same stem, or a skills copy beside `~/.agents/skills`. Doctor reports a twin as drift.
_Avoid_: Duplicate, backup

## MCP and secrets

**Stanza**:
One server's entry in a harness's MCP file: a bare command, its args and an env block of references.
_Avoid_: Row, entry (when meaning the whole file)

**Env reference**:
A pointer to an environment variable inside a stanza, in the harness's own syntax. Never a value.
_Avoid_: Placeholder, token

**Disabled server**:
A server defined in a harness's MCP file but switched off by that harness's flag. Only codegraph is enabled everywhere; Claude Code, which has no per-server flag at user scope, holds codegraph alone.
_Avoid_: Removed server

**Secrets cell**:
Doctor's check that every env reference a harness's stanzas use resolves to a set per-PC user environment variable. It reads names only.
_Avoid_: Vault check

## Skills

**Skills lock**:
`~/skills-lock.json`, written by `npx skills`. It names every external skill and its source.
_Avoid_: Pin file, manifest

**Stale skill**:
A skill folder that is not in the skills lock, usually because upstream removed it. Doctor reports it as drift until `npx skills remove <name> -y` purges it.
_Avoid_: Orphan, leftover

**Own skill**:
A skill written by the owner and published in the public repo Bearmancer/skills. It reaches a PC through `npx skills` like any other.
_Avoid_: External skill

**External skill**:
Somebody else's skill, installed by `npx skills` and recorded in the lock.
_Avoid_: Own skill

**Plugin skill**:
A skill that ships inside a plugin and stays with it. AI-Config never manages it.
_Avoid_: External skill

**Runtime skill**:
A skill that ships inside an app binary, such as omo's built-ins. AI-Config never manages it.
_Avoid_: Plugin skill, external skill

## Memory

**Memory mirror**:
The private GitHub copy of omo's local memory repository. Omo alone pushes to it; the home repo does not track it.
_Avoid_: Backup

## Tracker

**Root epic**:
The one issue at the top of a tracker tree. Its children are the indexes and the cross-cutting specifications.
_Avoid_: Master issue, umbrella

**Index**:
A child of the root epic that names one family of workstreams. It holds specifications, not tasks.
_Avoid_: Epic, plan

**Specification**:
One workstream's contract on the tracker: problem, end state, decisions, test seam. Its tickets are native sub-issues; it is never picked up directly.
_Avoid_: Spec file, PRD

**Ticket**:
One concern sized for one context window, with acceptance criteria and native blocked-by edges. A pull request carries a ticket's change.
_Avoid_: Task, story

**Ready ticket**:
An open ticket with no open blocker.
_Avoid_: Unblocked task, next item

**Concern branch**:
A branch that carries one concern, in one worktree, behind one pull request.
_Avoid_: Feature branch, WIP branch

**Safety branch**:
A labelled branch pushed only to preserve work that exists nowhere else, before it is split, rebased or deleted. It is never reviewed or landed as it stands.
_Avoid_: Backup branch, WIP branch

**Residue**:
Work that exists only offline: an uncommitted change, a stash, a local-only branch, a scratch folder or a local plan file. Each item gets a ticket that ends with it online or deleted.
_Avoid_: Leftovers, scratch
