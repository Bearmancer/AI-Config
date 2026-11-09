# CommandCode: features unique to the Desktop app and the CLI

Researched 2026-11-06. Package inspected live: `command-code@1.88.4` (UNLICENSED, bins `cmd`/`cmdc`/`commandcode`/`command-code`). Primary sources: commandcode.ai/docs/*, /changelog, GitHub `CommandCodeAI/command-code` + `CommandCodeAI/desktop`, the npm tarball's bundled CHANGELOG and `dist/cli.mjs`, and live unauthenticated `--help` on Windows 10.

Rival baselines fetched the same day: Claude Code, OpenAI Codex, Cursor, GitHub Copilot CLI, Gemini CLI, opencode, aider, Windsurf, Cline.

Classification: **UNIQUE** = no checked rival has an equivalent; **DIFFERENTIATED** = rivals have something similar but materially distinct; table stakes are omitted except in §5.

---

## TL;DR

The genuinely unique surface is **not** the agent harness itself — that is now table stakes. It is three things:

1. **Taste** — a learned, confidence-scored, portable preference profile (`taste-1` classifier, `taste.md`, git-like packages, learning from *other agents'* transcripts).
2. **The reseller economics made into product surface** — per-model credit allowances, auto-applied vendor deals, `-contributor` 95%-off variants, anonymous stealth models, credit-purchase commands and a credit-specific exit code.
3. **Mods** — hot-reloadable TypeScript that can rewrite the transcript, the stream, the system prompt, answer permission prompts, reroute models per request, register providers, and draw TUI panes; the product's own features are built on it.

Plus two gateway-level oddities that are unique but **not desktop features**: fail-closed cross-vendor ZDR routing and the `typesafe/jev` decision model.

The Desktop app's own unique contribution is narrow: a **Taste settings panel**, a **browser workbench with Design mode**, and an **in-app account/billing/credits surface**. Everything else unique in the desktop client traces back to the CLI or the gateway. The app is closed source; the public `CommandCodeAI/desktop` repo is installers and issues only.

---

## 1. Unique in the CLI

| Feature | Detail | Rival gap |
|---|---|---|
| **Taste learning** | `/taste`, `tasteLearning`, `--skip-onboarding`; a non-LLM "meta neuro-symbolic" classifier (`taste-1`) scores accept/reject/edit signals into an editable `taste.md` with category + calibrated confidence, and flags contradictions instead of overwriting | Claude `CLAUDE.md`/auto-memory, Cursor rules/memories, `GEMINI.md`, aider `--memory` are hand-written or session-scoped; none infers and scores preferences |
| **Taste packages** | `cmd taste push/pull/list/lint/open`, project → global → remote `commandcode.ai/<user>/taste`, `--public`, org namespaces, star/download counts, confidence-aware merge | No rival ships a versioned, mergeable, discoverable preference artifact |
| **Taste bootstrapping** | `cmd taste learn <repo\|owner/repo>`, `/learn-taste` — mines your existing repos **and other agents' session transcripts** (Claude Code, Cursor) | `claude import` copies config, not style |
| **Commercial gating in the terminal** | Per-model plan allowances (e.g. $100 of DeepSeek V4.1 Flash on a $10 plan), auto-applied deals, `…-contributor` ~95%-off model variants, anonymous stealth models (`crouton-alpha`, `glyph-cluster:free`, 1000 req/day), `beam:free` | Rivals expose only a plan-level quota |
| **Billing loop + credit exit code** | `/usage` 5h/weekly meters, `/extra` buy credits at cost, `/upgrade`; exit `10 = insufficient credits`, `8 = max turns`, `5 = rate limited`, `9 = no response` | No rival has an in-terminal credit purchase or a credit-specific exit code |
| **Mods (`ModApi`)** | Hot-reloadable TS; `addTool/addCommand/addFlag/addProvider/addAgent/addRenderer`; hooks `transformMessage` (transcript/secret rewrite), `transformTextDelta` (stream rewrite), `beforeModelRequest` (per-request model routing), `onPermissionRequest` (deny wins), `onStop` (force-continue), `transformInput` | opencode plugins are the closest; no UI rendering, no provider registration, no transcript/stream rewriting |
| **`cmd mods inspect <path>`** | Static capability audit "from its source (never runs it)", paired with `--ignore-scripts`, `--safe-mode`, project-mod trust gating | No rival offers a pre-run capability report |
| **`--tools-all` / `--tools-enable`** | Re-opens the human-only tools a headless `-p` run withholds (`/loop`, `exit_plan_mode`, `ask_user_question`) | Claude's `--tools` only restricts |
| **ZDR as a routing switch** | `CMD_ZDR=1` / `x-cmd-zdr: 1` → only ZDR-capable upstreams, hard `422 cmd_zdr_no_providers` instead of fallback; filters feature and free models | Rivals offer ZDR as an org contract, not a per-request fail-closed route across vendors |
| **Jev decision model** | `typesafe/jev` via `cmd -p` / `POST /provider/v1/systemone`: typed `noul`/`choice`/`score` questions → probabilities, never text; input-only billing ($0.042/M); refused interactively | No rival exposes a non-generative decision model |

Other CLI differentiators (not unique): `/goal` with an independent completion check, `/loop` + cron scheduler, `monitor_command` event wake-ups, a durable dependency-aware task ledger, per-session scratchpad, `/btw` side questions, native Windows `powershell` tool with `$LASTEXITCODE` awareness, artifact publishing, `/language`, `--local-only`, BYOK with `!command` secret resolution.

## 2. Unique to the Desktop app

| Feature | Detail | Rival gap |
|---|---|---|
| **Remote control via your own Telegram/Discord bot** | Settings → Remote control; `/rc`, approve-deny buttons, `/model` `/effort` `/stop` as tap targets, mode mirroring, one-bot takeover, per-session Discord threads; bot token stored in `~/.commandcode/auth.json` | Claude Code has `--rc`, but only through Claude's own app/relay; no rival lets you bring your own bot credentials. (Capability of phone control is not unique — the transport is.) |
| **Taste settings UI** | Review / forget learned preferences in Settings → Taste, per project and per user | Cursor/Claude memory is editable as text, not as a scored, reviewable profile |
| **Browser workbench + Design mode** | Pick an element in the live preview → element + page context into chat → preview style change → apply to source → undo; `/design` audit and treatment modes writing reports to `.commandcode/design/` | Cursor's browser and Cline's element picker are close; none pairs the picker with a codified design-violation taxonomy |
| **In-app account/billing surface** | Profile, plan, billing, credits, usage, refresh, sign-out inside Settings → Account | Rivals push billing to the web |

Important: the desktop app is **closed source** (development in a private repo, releases with empty notes). Several headline mechanics advertised as desktop features — scheduled agents, cloud sessions, `/share`, headless `-p`, background-task stopping, start-up flags — are documented as **CLI-only** in the parity table.

## 3. Unique to the gateway, visible on both surfaces

- **Pass-through deal economics**: hourly peak/off-peak DeepSeek rates, auto-applied vendor discounts (MiniMax 2×), boosted per-model allowances, geo-blocked models "not charged", all on one credit pool. No rival passes upstream time-of-day pricing into a subscription invoice.
- **Anonymous stealth preview models**: $0.00, 1000 requests/day, maker deliberately unnamed, refused under ZDR (`glyph-cluster`, `crouton-alpha`).
- **One credit pool over ~98 models** from ~19 vendors with per-model plan gating ($1 entry plan).
- **Provider API on your subscription key**: `api.commandcode.ai/provider/v1/{chat/completions,responses,messages,models,systemone}` — OpenAI *and* Anthropic wire formats; the CLI is just one client. Third-party harnesses already drive it (issues #1085, #1037, #1021).

## 4. Advertised as unique, but is not

`plan_review` "first of its kind" (Claude/Cursor/Gemini plan modes exist) · git worktrees (Claude `--worktree`, Gemini, Cursor) · cloud sessions (`cmd --cloud` vs Claude `--cloud`/`--teleport`, Codex cloud) · phone remote control (Claude `remote-control`) · `/import` (Claude `claude import`, opencode reads `.claude` by default) · checkpoints/rewind (Gemini `/restore`, Claude `/rewind`) · permission modes incl. `dont-ask` (explicitly Claude-compatible) · MCP/hooks/skills/subagents/per-agent models · headless JSON output (Command Code is actually behind: no `--json-schema`, no stream-input) · "best for open models" (positioning, not a feature) · `/design` as a moat (Anthropic frontend-design skill, Cursor Design Mode) · "open source later this month" (npm package is UNLICENSED; GitHub repo has no source, `language: null`).

## 5. Caveats and gaps

- No authenticated runs; quota commands and credit figures come from docs and issue reports. Per-plan dollar allowances change — re-read pricing-limits before quoting.
- `taste-1`'s architecture (neuro-symbolic, calibrated confidence, "100× cheaper than an LLM") is closed and unbenchmarked in public docs.
- Desktop exposure of the 5h/weekly meters is undocumented beyond "a Usage settings page"; `/usage` in the app just opens Settings.
- Whether Desktop can launch parallel/multi-agent work is undocumented; docs only promise watching background tasks.
- Windows: the installer is unsigned and beta; `cmd` → `cmdc` alias; no `--sandbox` flag exists (isolation is permission engine + worktree + cloud VM, not container sandboxing).
