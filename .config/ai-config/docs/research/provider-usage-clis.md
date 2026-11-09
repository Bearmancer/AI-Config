# CLI tools that report remaining quota: Muse Code, Alibaba Token Plan, CommandCode GOAT

Researched 2026-11-06. Host: Windows 10, PowerShell 7. Method: official vendor docs, npm registry, models.dev API, live `--help` and unauthenticated status-code probes. No accounts authenticated, nothing purchased, nothing installed system-wide.

## Answer

There is no *vendor-neutral* CLI that natively covers all three — but one tool, **Win-CodexBar**, does cover all three on Windows in a single command:

```powershell
winget install Finesssee.Win-CodexBar
codexbar-cli usage -p all            # every enabled provider, one terminal report
```

Caveats: CommandCode and Alibaba ride on pasted session cookies/tokens rather than a CLI login, and the Windows port lags upstream CodexBar by ~3 minor versions.

Native alternative — three commands, no cookie paste:

```powershell
cmd /usage                                   # CommandCode GOAT (interactive CLI; 5h + weekly)
npx @slkiser/opencode-quota@latest show      # Alibaba Token Plan + Coding Plan (+ all OpenCode providers)
muse usage                                   # Muse Code (Meta) headless usage
```

## Per-provider facts

| Provider | What it is | Official usage command | Auth it needs | Notes |
|---|---|---|---|---|
| **Muse Code** | Meta's terminal coding agent (dev.meta.ai), subscriptions $5–$200 | `muse usage` (headless, CLI ≥ 1.4.13); `/usage` interactive | CLI browser/device-code Meta sign-in | Windows supported natively. Meta publishes **no** REST quota endpoint; the only other machine-readable source is an SSE frame emitted during inference, which costs the quota it displays. Community readers hit `POST api.meta.ai/muse-code/key` (undocumented). |
| **Alibaba Token Plan** | Alibaba Cloud Model Studio / Bailian plan | `bl usage token-plan --output json`; `bl usage coding-plan`; `bl quota check` | **Console** login: `bl auth login --console --console-site international\|domestic` — a Token Plan API key alone is not enough | Package `bailian-cli` (2.8.3), npm `npm i -g bailian-cli` or `irm https://bailian.aliyun.com/cli/install.ps1 \| iex`. `bl` is what opencode-quota shells out to. |
| **CommandCode GOAT** | commandcode.ai subscription, `individual-goat` | `/usage` inside `cmdc` — **interactive only**; no documented headless flag (open request: CommandCodeAI/command-code#358) | `cmdc login` → `~/.commandcode/auth.json`, or `COMMAND_CODE_API_KEY` | Package `command-code`; on native Windows the binary is **`cmdc`** (`cmd` on WSL/macOS/Linux). No documented usage/billing API: `/provider/v1/usage` is 404. `/alpha/whoami`, `/alpha/billing/credits`, `/alpha/usage/summary` exist (401 unauthenticated) and are what the CLI itself calls — undocumented and unstable. |

## Aggregators, ranked

| Tool | Covers the 3? | Windows | Extensible to a custom HTTP endpoint | State |
|---|---|---|---|---|
| **Win-CodexBar** (`nesszer/Win-CodexBar`) | ✅ all three (`codexbar-cli usage -p all`) | ✅ native | No (providers are Rust code) | v0.70.0, 2026-10-03; actively porting upstream |
| **CodexBar** (`steipete/CodexBar`) | ✅ all three, best-auth (CommandCode via `COMMAND_CODE_API_KEY`) | ❌ binaries macOS/Linux; WSL2 only | ✅ JS/TS provider plugins, declared + approved endpoints | v0.83.0, 2026-10-31; daily commits |
| **opencode-quota** (`slkiser/opencode-quota`) | ⚠️ Alibaba ✅ built-in; CommandCode only as a custom `remote-api`; Muse ❌ | ✅ `npx @slkiser/opencode-quota@latest show` | ✅ `providers.custom`, GET + `quota-v1`/`json-v1` only | npm 6.2.2, 2026-11-05 |
| **bailian-cli (`bl`)** | Alibaba only | ✅ | ❌ | 2.8.3, 2026-11-06 |
| **Command Code CLI (`cmdc`)** | CommandCode only, interactive `/usage` | ✅ | ❌ | active |
| **tokscale** | Token *history* for CommandCode/Muse; quota table has none of the three | ✅ | ❌ | npm 4.21.0, 2026-11-02 |
| **quotio CLI** | ❌ none of the three | ❌ no Windows release | ❌ | 0.2.12, 2026-09-15 |
| **ccusage** | ❌ cost/token logs, never remaining quota | ✅ | ❌ | npm 20.0.48, 2026-11-02 |

Dead/irrelevant: npm `usage` (2015), `ai-usage` (hook forwarder). macOS-only: codenotch, CodexBar app, Quotio app.

## If the goal is to keep opencode-quota as the hub

- CommandCode is addable as a `providers.custom` entry, `mode: "remote-api"`, pointing at `https://api.commandcode.ai/alpha/billing/credits` with `apiKeyEnv: "COMMAND_CODE_API_KEY"`, mapped with `json-v1`. It will then appear in `opencode-quota show`. This is inferred from the documented endpoint plus the `json-v1` mapping spec — no published working example, and the endpoint is undocumented.
- Muse Code is **not** addable: `remote-api` is fixed GET-only with no custom headers, and Meta's quota is only reachable by POST to the mint endpoint or by spending an inference turn.
- **Relevant to issue #250**: the maintainer closed "Add Command Code GOAT quota provider" as not planned citing three things — Command Code was not on models.dev, no reply on the endpoint question, and vendor hostility. The first is now stale: `commandcode` is a listed models.dev provider today (`CMD_API_KEY`, `api.commandcode.ai/provider/v1`). The other two still hold — there is still no *documented* usage API.

## Gaps

- No authenticated quota run was performed; field names come from docs and community readers.
- CommandCode GOAT allowances differ between sources ($70 vs $100 monthly credits); re-read the GOAT pricing page before quoting numbers.
- Win-CodexBar's Muse credential path on Windows (file vs Keychain) is documented only by implication — verify after `muse login`.
