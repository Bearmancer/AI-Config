#!/usr/bin/env bash
# One-shot per-PC setup: puts the AI-Config repo in place at $HOME and wires the apps.
# The bash twin of setup.ps1; both do the same five steps.
#
#   1. git clone --no-checkout <remote> ~/Dev/AI-Config, core.worktree = $HOME.
#   2. Save `git diff` of the live files against the repo, then checkout -f.
#   3. Set user environment variables for the secrets the MCP set references,
#      from `bws secret list` (values are never printed). On Linux they go to
#      ~/.config/environment.d/ai-config.conf (mode 600), read at the next login.
#   4. npx skills experimental_install, run from $HOME. It installs only to
#      universal agents (.agents/skills), so it then runs
#      npx skills add <source> -s <name> -a claude-code -y for each lock skill
#      (one name per call; multi-name -s fails on some sources) to fill ~/.claude/skills.
#   5. Write the OpenCode MCP server set into the app-owned Cline and Claude files:
#      Cline holds every server with all but the harnesses.toml [shared] enabled_servers
#      set to disabled; Claude holds only the enabled servers.
#
# Usage: setup.sh <remote> [branch]. Needs git, bws, npx, python3, BWS_ACCESS_TOKEN.
set -euo pipefail

remote="${1:?usage: setup.sh <remote> [branch]}"
branch="${2:-main}"

repo="$HOME/Dev/AI-Config"
config_dir="$HOME/.config/ai-config"
report="$repo/live-vs-repo.diff"

for tool in git bws npx python3; do
  command -v "$tool" >/dev/null || { echo "$tool is not on PATH" >&2; exit 1; }
done
[ -n "${BWS_ACCESS_TOKEN:-}" ] || { echo "BWS_ACCESS_TOKEN is not set" >&2; exit 1; }
[ ! -e "$repo/.git" ] || { echo "$repo already exists; setup is one-shot" >&2; exit 1; }

# 1. Clone without a checkout and point the worktree at $HOME.
git clone --no-checkout --branch "$branch" -- "$remote" "$repo"
git -C "$repo" config core.worktree "$HOME"
git -C "$repo" config status.showUntrackedFiles no
git -C "$repo" config core.hooksPath "$config_dir/hooks"

# 2. Report how the live files differ from the repo, then take the repo's version.
git -C "$repo" read-tree HEAD
# The diff can contain secrets: create the report owner-only.
(umask 077; git -C "$repo" diff >"$report")
echo "Live-file diff saved to $report (it may contain secrets; delete it after review)."
git -C "$repo" checkout -f --end-of-options "$branch"

# Steps 3 and 5 share one reader of opencode.jsonc (comments and trailing commas allowed).
export AI_CONFIG_OPENCODE_CONFIG="$HOME/.config/opencode/opencode.jsonc"

rc=0
python3 - <<'PY' || rc=$?
import json, os, re, subprocess, sys, tomllib
from pathlib import Path

ENV_REF = re.compile(r"\{env:([A-Za-z_][A-Za-z0-9_]*)\}")
# bws prefix for an MCP env var is the var minus _API_KEY, unless listed here (prefix -> bws prefix).
PREFIX_ALIAS = {"SGAI": "SCRAPEGRAPHAI"}


def load_jsonc(text):
    out, i, in_str = [], 0, False
    while i < len(text):
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\":
                out.append(text[i + 1])
                i += 1
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
            out.append(c)
        elif text.startswith("//", i):
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        elif text.startswith("/*", i):
            i = text.index("*/", i) + 2
            continue
        else:
            out.append(c)
        i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(out)))


def resolve(var, secrets):
    for s in secrets:
        if s["key"] == var:
            return s
    prefix = re.sub(r"_API_KEY$", "", var)
    prefix = PREFIX_ALIAS.get(prefix, prefix)
    named = sorted(
        (s for s in secrets if s["key"] == prefix or s["key"].startswith(prefix + "_")),
        key=lambda s: s["key"],
    )
    return named[0] if named else None


servers = load_jsonc(Path(os.environ["AI_CONFIG_OPENCODE_CONFIG"]).read_text("utf-8"))["mcp"]["servers"]
enabled = set(
    tomllib.loads((Path.home() / ".config/ai-config/harnesses.toml").read_text("utf-8"))["shared"]["enabled_servers"]
)
variables = sorted(
    {m for s in servers.values() for v in s.get("environment", {}).values() for m in ENV_REF.findall(v)}
)

# 3. Environment variables.
listing = subprocess.run(["bws", "secret", "list"], capture_output=True, text=True)
if listing.returncode != 0:
    sys.exit(f"bws secret list failed with exit code {listing.returncode}")
secrets = json.loads(listing.stdout)
lines, missing = [], []
for var in variables:
    secret = resolve(var, secrets)
    if secret is None:
        missing.append(var)
        continue
    value = secret["value"]
    if any(c in value for c in "\r\n\0"):
        sys.exit(f"secret for {var} contains a newline or NUL character and cannot be written to environment.d")
    if not re.fullmatch(r"[A-Za-z0-9_@%+=:,./-]*", value):
        # Single quotes keep $, spaces and # literal for both systemd and a shell sourcing the file.
        value = "'" + value.replace("'", "'\\''") + "'"
    lines.append(f"{var}={value}")
    print(f"env: set {var}")
if lines:
    target = Path.home() / ".config/environment.d/ai-config.conf"
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
if missing:
    print(f"warning: no bws secret found for: {', '.join(missing)}", file=sys.stderr)


# 5. MCP entries for the apps whose files are not tracked.
def entry(server, template, typed):
    command = server["command"]
    out = {"type": "stdio"} if typed else {}
    out["command"], out["args"] = command[0], command[1:]
    if "environment" in server:
        out["env"] = {
            k: ENV_REF.sub(lambda m: template.replace("VAR", m.group(1)), v)
            for k, v in server["environment"].items()
        }
    return out


def write_servers(path, label, template, typed, keep_disabled):
    doc = json.loads(path.read_text("utf-8")) if path.exists() else {}
    doc.setdefault("mcpServers", {})
    for name, server in servers.items():
        if name in enabled:
            doc["mcpServers"][name] = entry(server, template, typed)
        elif keep_disabled:
            doc["mcpServers"][name] = {**entry(server, template, typed), "disabled": True}
        else:
            doc["mcpServers"].pop(name, None)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)
    print(f"{label}: wrote {len(doc['mcpServers'])} MCP servers to {path} (enabled: {', '.join(sorted(enabled))})")


write_servers(Path.home() / ".cline/data/settings/cline_mcp_settings.json", "cline", "${env:VAR}", False, True)
write_servers(Path.home() / ".claude.json", "claude", "${VAR}", True, False)
sys.exit(1 if missing else 0)
PY

# 4. Skills: restore from ~/skills-lock.json into ~/.agents/skills (4-25 minutes, needs GitHub),
# then add every lock skill for Claude Code, one `add` per skill name. npx reads stdin,
# so each call gets </dev/null and cannot eat the loop's input.
# computedHash is a sha256 over the raw bytes of a fresh `git clone` of the source, so a
# CRLF checkout changes it: Git for Windows ships core.autocrlf=true, and even with it off a
# text=auto repo (firecrawl/skills) is checked out with native CRLF unless core.eol=lf. These
# env vars set both for the npx processes only; no git config file is touched.
(
  cd "$HOME"
  export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false GIT_CONFIG_KEY_1=core.eol GIT_CONFIG_VALUE_1=lf
  npx --yes skills experimental_install
  mapfile -t pairs < <(python3 - <<'PY'
import json
from pathlib import Path

# The skills CLI has no `--` separator, so a value that could read as an option is refused.
for name, entry in json.loads((Path.home() / "skills-lock.json").read_text("utf-8"))["skills"].items():
    if name.startswith("-") or entry["source"].startswith("-"):
        raise SystemExit(f"skills-lock.json: refusing option-like source or name for {name!r}")
    print(entry["source"], name, sep="\t")
PY
  )
  for pair in "${pairs[@]}"; do
    IFS=$'\t' read -r source name <<<"$pair"
    npx --yes skills add "$source" -s "$name" -a claude-code -y </dev/null
  done
)

[ "$rc" -eq 0 ] || exit "$rc"
echo "setup complete. Log out and in (or restart apps) to pick up the new environment variables."
