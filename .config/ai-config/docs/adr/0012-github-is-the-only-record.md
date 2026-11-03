# GitHub is the only record

Context: Plans, todo lists, decisions and failure evidence lived in local plan files, scratch folders, stashes and uncommitted worktrees. An audit found work that existed nowhere else, so a worktree removal or a disk failure would have destroyed it, and no session could see it.

Decision: The only record of work is GitHub issues and pull requests. Issues about the PCs and their config live in the private repo Bearmancer/Machine-Config, which has no Project board. Issues about an own skill live in the public repo Bearmancer/skills. The public repo Bearmancer/AI-Config holds this repo's code, docs and pull requests. A plan is an issue body in a tree (root epic, index, specification, ticket) linked as native sub-issues and ordered by native blocked-by edges. Failures are comments on the issue that hit them; small decisive evidence goes to the wiki. Every branch, worktree, stash and dirty file maps to a pull request and an issue, and a change carries one concern.

A plan-mode file may sit in the plan home until it is live, meaning filed as an issue and named on a `Tracker:` line; `sprawl-gate drain` deletes it only after the issue is verified, so the tracker stays the one source of truth.

Alternatives rejected: a local plan file per project (dies with the worktree and cannot express blocking); a Project board (it has no body, no sub-issue tree and no edges of its own); a wiki-only record (not linked to branches or pull requests, so readiness cannot be computed).

## Consequences

- A plan file is never a second record: until it is drained it is a draft (no Tracker line) or a copy awaiting deletion, and `sprawl-gate check` fails on both.
- Where an issue lives says what it is about: a PC, a skill or the repo.
