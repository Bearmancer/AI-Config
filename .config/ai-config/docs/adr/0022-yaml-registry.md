# The harness registry is YAML

Context: `harnesses.toml` was the only AI-Config TOML and the only registry doctor read. Every reader used `uv run --no-project` and Python's stdlib `tomllib`; the registry was tracked, but the allowlist admitted only that file.

Decision: `harnesses.yaml` is the only registry. It keeps the `shared` mapping and six harness mappings in the same order. `lib/yaml_config.load_registry` uses `yaml.safe_load`, rejects a non-mapping, a missing `shared`, and duplicate keys, and is the only loader for doctor, tests, and the setup CLI. `scripts/registry_cli.py enabled-servers <path>` is the setup.ps1 reader; setup.sh imports the same loader inside its heredoc. Every reader that imports yaml runs with `--with pyyaml`: the hook, CI, README commands, and the setup readers. The YAML file is hand-converted in block style so the schema comments survive. `!/.config/ai-config/harnesses.yaml` admits it to the allowlist. Cutover is one-way after the local TOML-vs-YAML parity command is green: track YAML, remove the TOML and every `tomllib` reader; no dual reader.

Alternatives rejected: ruamel.yaml (round-trip comments, heavier dependency and more code); a dual reader (hides a half-migrated registry and doubles the parser surface); keeping the registry untracked (source of truth outside git).

## Consequences

- Adding a harness is still one mapping in one file.
- A missing `--with pyyaml` fails at import; the hook and CI commands are the enforcement point.
- The TOML file remains in git history; the YAML is the current source of truth.
- Redaction keeps its YAML key:value support and its TOML pair support for other staged TOML.
