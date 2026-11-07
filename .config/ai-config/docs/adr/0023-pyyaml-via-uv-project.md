# pyyaml, pytest, and ty run from one AI-Config uv project

Context: ADR 0022 kept the harness registry in YAML and wired every reader with `uv run --no-project --with pyyaml`. That repeated the dependency at every call site, made a missed `--with` an import-time failure, and contradicted issue #7's direction: declare tools in uv, not with `--with`. The pre-commit hook, CI, README, `setup.sh` and `setup.ps1` all carried their own copy of the flag.

Decision: `.config/ai-config/pyproject.toml` is the one project. It declares `pyyaml` as a runtime dependency, `pytest` and `ty` in the dev group, `pythonpath = ["."]` for the test seam, and `package = false`. `uv.lock` pins the set. Every yaml reader runs `uv run --project ~/.config/ai-config`; the hook, CI, README, and both setup scripts no longer use `--with`. The redaction scanner stays `uv run --no-project` because it imports no third-party package. `ty check` covers `lib/` and `scripts/`; pytest fixtures are dynamically typed and stay out of the type pass. CI runs the lint step; the pre-commit hook keeps its three gates (redaction, doctor, tests) because a type pass is slower and advisory.

Alternatives rejected: keep `--with` at each call site (duplicated, easy to forget, issue #7); a requirements file plus a hand-managed venv (no lock, no tool versions); `uv tool install` per script (heavier, no shared environment).

## Consequences

- One lock pins pyyaml, pytest, and ty; adding a dependency is one edit plus `uv lock`.
- A missing project environment fails at `uv run --project`, not at an import inside a reader.
- Tests must pass the tests path: a bare `pytest` from the home folder collects the home tree.
- `ty` is green on `lib/` and `scripts/`; the CI lint step and the README command are the enforcement points.
