# Spec: CommandCode Restore and Harness Alignment — V1

Status: proposed (awaiting owner approval)

## Objective

Land one PR — #12 — that assimilates PR #10 (config sync) and PR #11 (CommandCode
removal + doctor/CI repairs) and then reverses the removal: CommandCode returns as a
sixth first-class harness, aligned with the other five everywhere the repo defines a
harness (registry, doctor, guards, setup scripts, docs, AGENTS.md). #10 and #11 close
as superseded. The machine is restored to a working CommandCode install. The earlier
standing instruction is executed in the same PR: GitHub CI removed entirely, doctor
and the test suite stripped to essentials.

Base: `chore/remove-commandcode` tip `a5dbe3b` (already contains all of #10 through
`b984d5d`; merge-base confirms #10 adds nothing). New branch: `restore/commandcode`.

## Assumptions I'm making

1. OpenCode's provider policy stays Anthropic + Alibaba (owner ruling 2026-11-26).
   The old `commandcode` provider block in `opencode.jsonc` does NOT come back;
   CommandCode is restored as its own harness CLI, not as an OpenCode provider.
2. The instruction "Remove CI entirely. Strip doctor / tests to bare essentials"
   still stands and ships inside PR #12.
3. `oh-my-opencode-slim.jsonc` `marketplace.enabled` returns to `true` (it was set
   false only as part of the removal).
4. `~/.git` disappearing from the home folder is another lane's doing; PR #12 treats
   `Dev\AI-Config` as canonical and does not recreate a home repo.
5. Model lineups, `qwen3.8-max`/`qwen4-max` availability, plugin versions and
   `~/.secrets` are untouched by this work.

→ Correct any of these before implementation starts.

## Commands

```
Suite:   uv run --project .config/ai-config pytest -q -p no:cacheprovider .config/ai-config/tests
Doctor:  uv run .config/ai-config/tests/doctor.py --home .        # repo-only equivalent
Live:    uv run .config/ai-config/tests/doctor.py                 # against the real home
Machine: command-code --version ; opencode mcp list ; opencode models
```

## Project structure (files this spec touches)

```
.config/ai-config/harnesses.yaml        → commandcode mapping restored (6 harnesses)
.config/ai-config/tests/doctor.py       → stripped to essentials + commandcode shape
.config/ai-config/tests/*               → test_doctor.py, test_guards.py, cases.json,
                                          guard_parity.ts, test_registry_cli.py deleted;
                                          entrypoints/cutover tests updated
.config/ai-config/hooks/pre-commit      → scan + doctor + slim suite, no skip-regex
.config/ai-config/scripts/setup.{ps1,bat,sh} → commandcode sections restored
.config/ai-config/scripts/scan_staged.py     → commandcode live paths back in allowlist
.config/ai-config/README.md, GLOSSARY.md     → six harnesses; stripped-doctor docs
.config/ai-config/docs/adr/0021-*.md         → restored as accepted (CommandCode harness)
.config/ai-config/docs/adr/0002-*.md         → status line matches stripped suite
.github/workflows/test.yml              → deleted (CI removed entirely)
.agents/AGENTS.md                       → rewritten (CommandCode back, six harnesses)
Machine: ~/.commandcode/, ~/.commandcode.json, ~/.config/commandcode/plugins/,
         ~/.config/commandcode/marketplaces/, skills-lock.json, slim marketplace flag
```

## Scope of work

### A. Repo: restore CommandCode as sixth harness
- `harnesses.yaml`: commandcode mapping (instructions path + second-file rule,
  skills root `~/.commandcode/skills` with link rule, files: `settings.json`,
  `plugins/*.ts`). MCP cell: probe the CLI; if CommandCode has no MCP config
  surface, the cell is `na` with the probed reason (ADR 0020 rule).
- `doctor.py`: commandcode entry in SHAPES (its real stanza dialect, read from the
  restored config files, not guessed).
- Guards: `guards.yaml` parity cases for commandcode re-added; guard plugin copies
  under `~/.config/commandcode/plugins/` restored byte-identical with the other
  harness copies (this is machine state, section C).
- `setup.*` scripts: commandcode config-dir creation, plugin install, skill links.
- `scan_staged.py`: `~/.commandcode.json` and `~/.commandcode/settings.json` paths.
- Docs: six-harness counts everywhere; ADR 0021 restored/accepted; README doctor and
  gates sections describe the stripped reality (no CI; hook = scan + doctor + suite).

### B. Repo: strip CI, doctor and tests to essentials
- Delete `.github/workflows/test.yml`.
- `doctor.py` keeps: cell matrix, file presence, JSONC parse, MCP server-name parity
  across harnesses, skills-lock presence check, literal-secret scan on tracked files.
  It drops: stanza shape policing (allowed keys, bare-command, env-ref regexes),
  enabled-server set checks, twin/second-file scans, hard-link samefile checks,
  tracked-set/.gitignore/exec-bit probes, `--repo-only`/`--json` flags.
- Tests kept: redaction, envfile, yaml_config, registry schema/cutover/docs,
  entrypoints (updated: no CI file, hook without skip-regex). Deleted: the doctor
  fixture matrix, guard-parity runner + cases, registry CLI test.
- `pre-commit`: always scan → doctor → suite (suite is now seconds).

### C. Machine: restore the install
- Reinstall `command-code` (npm latest 1.93.4) via bun global; verify
  `command-code --version`.
- Restore `~/.commandcode.json` and `~/.commandcode/` from
  `~/.config/backup-commandcode-removal-2026-11-26/commandcode-home.zip`
  (Test-Path + size check before and after, per the backup rule).
- Recreate the 25 skill junctions `~/.commandcode/skills/<name>` →
  `~/.agents/skills/<name>` with `cmd /c mklink /J` (standing rule: junctions, never
  directory symlinks). Verify count and targets.
- Restore `skills-lock.json` `commandcode` entry; flip slim `marketplace.enabled`
  back to `true`; reload and verify no plugin load errors.
- Live `~/.agents/AGENTS.md` rewritten in the same pass as the repo copy.

### D. AGENTS.md rewrite
- CommandCode paragraph back: config dir `~/.commandcode`, settings.json, plugin
  guard copies, skills junction rule.
- Global-instructions paragraph: copies are "omo, OpenCode, Kilo, Cline and
  CommandCode" (whatever the restored truth is — verified by hash across copies).
- Harness lists read six; stale removal wording (backup folder, deletion ledger
  references) taken out; no other content changes.

### E. PR mechanics
- Branch `restore/commandcode` from `a5dbe3b`; open PR #12 titled
  `restore(ai-config): CommandCode as sixth harness; CI out; checks to essentials`.
- Close #10 and #11 with a comment pointing at #12 (no merges of either).
- Merge #12 when doctor + suite + machine probes pass (merge order is mine per owner).

## Testing strategy

- Slim pytest suite green (kept tests only).
- `doctor.py --home .` on the PR checkout: zero DRIFT/MISSING/UNKNOWN.
- Live doctor after machine restore: commandcode cells OK.
- Machine probes: `command-code --version`; 25 junctions resolve; guard plugin files
  hash-identical across the six harness copies; AGENTS.md hash-identical across
  copies; `skills-lock.json` entry present; slim marketplace flag true.
- Redaction: `scan_staged.py` clean on every commit.

## Boundaries

- Always: backup Test-Path+size proof before any restore-overwrite; junctions via
  mklink /J; verify after every machine step.
- Ask first: any `harnesses.yaml` schema change beyond restoring commandcode; any
  new dependency; anything touching `~/.secrets`; recreating a home git repo.
- Never: restore the `commandcode` provider into `opencode.jsonc` (assumption 1);
  force-push shared branches; merge #10/#11; delete any source without coverage.

## Success criteria

1. PR #12 open from `restore/commandcode`; #10 and #11 closed referencing it.
2. Six harnesses in registry, doctor, guards, setup scripts, docs and AGENTS.md.
3. No CI workflow in the repo; hook runs scan + doctor + slim suite; all green.
4. `command-code` works on this machine; `~/.commandcode` fully restored; 25 skill
   junctions live; skills-lock entry back; slim marketplace enabled.
5. AGENTS.md rewritten, byte-identical across the harness copies that share it.
6. OpenCode still Anthropic + Alibaba only; lineups and model availability unchanged.
7. Zero literal secrets in any tracked file.

## Out of scope (deferred)

- CommandCode model roster/pricing tuning (settings.json stays as backed up).
- The vanished `~/.git` home repo — separate lane, flagged to owner, not rebuilt here.
- Guard plugin content changes beyond restoring parity copies.
- Any provider/lineup change to OpenCode config.

## Open questions

1. Assumption 1 (no commandcode provider in opencode.jsonc) — confirm or override.
2. CommandCode MCP surface: does the CLI read an MCP config? If yes, it gets the
   twelve-server set like every other harness; if no, an `na` cell. Probed at
   implementation; answer recorded in the registry either way.
