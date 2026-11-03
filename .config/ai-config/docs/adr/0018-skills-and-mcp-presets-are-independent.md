# Skills and MCP servers are independent surfaces

Context: Skills and MCP servers were once selected by a single tier field per harness, so granting one meant granting the other. They change for different reasons and come from different places.

Decision: Neither surface selects the other. Skills come from `~/skills-lock.json` through `npx skills` (see [0005](0005-skills.md)). MCP servers come from the stanzas in each harness's MCP file (see [0004](0004-mcp-presets-and-tiers.md)). A harness has no tier, no preset field and no second field that defaults from the first. Doctor checks the two surfaces in separate cells, so a fault in one never hides a fault in the other.

Alternatives rejected: one field that picks both (it hid the real choice and doubled every change); a shared list for both (they change at different times and live in different places).

## Consequences

- Enabling a server touches the MCP files only, and adding a skill touches the lock only.
- Every harness that reads `~/.agents/skills` sees the same skills, whatever its MCP set.
