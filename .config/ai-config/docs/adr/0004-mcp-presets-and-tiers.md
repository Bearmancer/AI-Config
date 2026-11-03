# MCP servers: one stanza shape, codegraph enabled everywhere

Context: Five harnesses need MCP servers, each with its own file and dialect. The same ten servers must exist in every harness, a server must not launch unless the owner wants it, and no secret may sit in a tracked file.

Decision: Every harness defines the same ten servers: agentql, arxiv, codegraph, dappier, exa, firecrawl, paper-search, scrapegraph, tavily and zotero. Each stanza has one shape: a bare command (no path, no `.cmd` or `.exe` suffix, no `~/`, no `cwd`), its args, and an env block that holds only references to environment variables. OpenCode and Kilo spell the same shape as a command array, an `environment` block and `type: local`; omo and Cline use `command`, `args` and `env`; Claude Code adds `type: stdio`.

An env reference is written in the harness's own syntax, `${VAR}` for omo and Claude Code, `${env:VAR}` for Cline and `{env:VAR}` for OpenCode and Kilo. The value lives in a per-PC user environment variable (see [0006](0006-secrets-and-gates.md)). The one literal allowed in a stanza is `ZOTERO_LIBRARY_ID`, a non-secret number. omo starts a stdio server with its default environment plus the stanza's env block, so the block is what carries each reference.

Only codegraph is enabled, in every harness. The other nine stay defined and are switched off with the flag each harness documents: `enabled: false` in omo and Kilo, `disabled: true` in OpenCode and Cline. Claude Code has no per-server disable flag in a user-scope entry, so its file holds codegraph alone. Doctor requires the enabled set to equal codegraph, every other harness's server names to equal OpenCode's, and Claude's file to hold exactly codegraph.

The arxiv server runs `uvx arxiv-mcp-server` (the blazickjp package, free, no key; never npx, the npm package of that name is an unrelated project). Servers built into a harness are not defined here: omo's context7, grep_app, websearch, lsp and ast_grep, OpenCode's context7 and gh_grep. Browser work uses each harness's own browser tool.

The tracked MCP files are `~/.omo/agent/mcp.json`, `~/.config/opencode/opencode.jsonc` and `~/.config/kilo/kilo.jsonc`. The setup script writes the same set into the app-owned `~/.cline/data/settings/cline_mcp_settings.json` and `~/.claude.json`. A stanza is never launched through `bws run`, because the MCP stdio handshake fails under it.

Alternatives rejected: a literal key in a stanza (it would enter history); a launcher wrapper that fetches secrets at start (the handshake fails under it); different server sets per harness (the sets drift apart and doctor cannot tell a choice from a mistake).

## Consequences

- All ten servers start headless on every PC, with keys read from the user environment.
- Enabling another server is a one-line flag change in each file, and doctor says if one harness is missed.
- Claude Code carries one server because it cannot carry disabled ones.
