# Secrets live in per-PC environment variables; the commit gate refuses a literal

Context: Config files are tracked, so one secret-shaped literal in any of them would enter git history and every PC. The tools still need real credentials at run time.

Decision: A tracked file never holds a secret. MCP stanzas carry references to environment variables (see [0004](0004-mcp-presets-and-tiers.md)), and the values are user environment variables on each PC: the user registry on Windows, the file ai-config.conf under the environment.d folder of the user config (mode 600) on Linux.

The setup script sets them once per PC from Bitwarden Secrets Manager. It runs one `bws secret list`, and for each variable a stanza references it picks the secret named exactly that, or else the first, in name order, whose name starts with the variable's service prefix. A variable it cannot resolve is reported by name and the script exits non-zero. A value that is already set on the PC and differs from bws is left alone. The token is `BWS_ACCESS_TOKEN`, read by `bws` from the environment; it is never stored by ai-config, passed as an argument, printed or logged. GitHub auth is per machine and is never in bws.

The pre-commit hook scans every staged file with the redaction scan (`lib/redaction.py` through `scripts/scan_staged.py`). A secret-shaped literal refuses the commit, printed as `path:line (class)` without the value.

Doctor's `secrets` cell checks that each variable a harness's stanzas reference is set, by name. On Windows it reads the user environment, elsewhere the process environment. It never reads a value into its output.

Alternatives rejected: a placeholder that is resolved when files are built (it needs a build step and a second copy of every file); a secret file beside the config (a second store to keep current); a standing token or daemon (a wider window than one fetch during setup); a warning instead of a refusal (the secret is already in history by then).

## Consequences

- A missing token, a `bws` failure or an unresolved reference stops setup with a message that names the variable, never a value.
- Rotating a key is a bws change followed by setting the variable again on each PC.
- A value in the user environment is visible to any process the owner runs, which is the cost of keeping it out of git.
