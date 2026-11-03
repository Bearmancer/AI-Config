# Kilo keeps all its settings in one tracked file

Context: Kilo keeps instructions, MCP servers and its own settings in one file, `~/.config/kilo/kilo.jsonc`, which also holds the owner's comments.

Decision: That file is tracked as it is, in place. Its `instructions` key holds `~/.agents/AGENTS.md` (see [0014](0014-instructions-are-import-lines.md)), its `mcp.servers` map holds the ten servers in the one stanza shape (see [0004](0004-mcp-presets-and-tiers.md)), and every other key is a Kilo setting. Git is what merges edits from two PCs, and a comment survives because nobody rewrites the file but Kilo and the owner. Doctor counts the file for three cells, instructions, mcp and config, and each cell reads only its own keys.

Kilo's deprecated top-level `permission` key is absent (see [0016](0016-no-deprecated-config-keys.md)): the schema flags it, and this Kilo runtime rejects the v2 `permissions` replacement. Kilo's default allows every tool and asks before it reaches outside the project or repeats a failing call.

Alternatives rejected: splitting the settings into a second file (Kilo reads one); generating the file from parts (a build step and a second copy).

## Consequences

- A key a tool adds to the file is a diff to review, not drift.
- Two PCs editing the same line conflict in git, which is the right place to resolve it.
