# A harness table owns its files, and JSON configs are JSONC

Context: Doctor has to know which files each harness reads and why. Once those facts lived in code, and a rename broke the guess.

Decision: Each table in `harnesses.toml` names every file ai-config checks for that harness, and each file declares what doctor needs to know: `tracked` (committed, or app-owned), `optional`, `writer` for an untracked file, `via` for how an instruction file is loaded, `env_ref` for the secret syntax and `servers_at` for where the MCP map sits. A cell a harness cannot have is `{ na = "<reason>" }`, so a gap is always a statement, never an omission (see [0002](0002-harness-registry-and-tests.md)).

A JSON config is named `.jsonc`, so a comment can live in it, and no file exists under both names (owner, 2026-10-31: "no dupe files and always jsonc instead of json"). A file keeps `.json` only when the tool that reads it loads no `.jsonc` of that stem; its entry then carries `json_only = "<reason>"` citing the probed loader. A reason is a fact someone checked, never a guess; a tool whose loader is unproven reads as `.json`. Slim's `~/.config/opencode/oh-my-opencode-slim.jsonc` and omo's `~/.omo/agent/settings.jsonc` are `.jsonc`. OpenCode's `~/.config/opencode/cli.json`, omo's `~/.omo/agent/keybindings.json`, `~/.omo/agent/models.json` and `~/.omo/agent/mcp.json`, and Cline's `~/.cline/data/settings/cline_mcp_settings.json` stay `.json`.

A twin is a `.json` file beside a managed `.jsonc` of the same stem. Doctor reports it, and the owner removes the stale one by hand. Nothing deletes it for them.

Plugins are not registered here. A plugin is listed in the `plugin` array of its harness's own config, which is a tracked file, so adding one is an ordinary edit and commit.

Alternatives rejected: guessing a file's duty from its name (a rename breaks the guess); a `.json` file kept because it was always `.json` (the owner's rule is `.jsonc` unless the loader forbids it).

## Consequences

- A `.json` entry without a `json_only` reason, or a reason that names no `.json` file, is a registry error.
- Adding a file is adding one entry; its doctor cell follows from it.
- The oci OpenCode twin (`opencode.json` beside `opencode.jsonc`) is merged into the JSONC file and removed when that PC is brought in line.
