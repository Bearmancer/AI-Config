"""ai-config doctor: the 25-cell parity check (5 harnesses x 5 surfaces).

Reads harnesses.toml and the live files. Prints one row per cell and exits 0
only when every cell is OK or NA. It never writes or fixes anything and never
prints a secret value (only variable names, file names and line numbers).

States: OK, DRIFT (present but wrong), MISSING (absent; never OK),
NA (the harness cannot take the surface; the reason comes from harnesses.toml),
UNKNOWN (the check itself failed).

    uv run --no-project python ~/.config/ai-config/scripts/doctor.py [--json] [--repo-only]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

sys.dont_write_bytecode = True
CONFIG_DIR = Path(__file__).resolve().parent.parent
if str(CONFIG_DIR) not in sys.path:
    sys.path.insert(0, str(CONFIG_DIR))

from lib import jsonc  # noqa: E402
from lib.redaction import scan_text  # noqa: E402

HARNESSES = ("omo", "opencode", "kilo", "cline", "claude")
SURFACES = ("instructions", "mcp", "skills", "config", "secrets")
OK, DRIFT, MISSING, NA, UNKNOWN = "OK", "DRIFT", "MISSING", "NA", "UNKNOWN"
_PRIORITY = (MISSING, DRIFT, UNKNOWN)

# MCP stanza dialects. `off` is the (key, value) that disables a server; claude
# has no per-server disable flag, so its file holds the enabled set only.
SHAPES = {
    "omo": dict(cmd="str", env="env", off=("enabled", False), type=None,
                allowed={"command", "args", "env", "enabled"}),
    "opencode": dict(cmd="list", env="environment", off=("disabled", True), type="local",
                     allowed={"type", "command", "environment", "disabled"}),
    "kilo": dict(cmd="list", env="environment", off=("enabled", False), type="local",
                 allowed={"type", "command", "environment", "enabled"}),
    "cline": dict(cmd="str", env="env", off=("disabled", True), type=None,
                  allowed={"command", "args", "env", "disabled"}),
    "claude": dict(cmd="str", env="env", off=None, type="stdio",
                   allowed={"type", "command", "args", "env"}),
}
SERVERS_AT = {"omo": "mcpServers", "cline": "mcpServers", "claude": "mcpServers"}
IMPORT_LINE_FILE = ".claude/CLAUDE.md"
# Other places a harness could load a second instruction file from.
SECOND_INSTRUCTIONS = {
    "omo": (".omo/agent/AGENTS.md", ".omo/AGENTS.md"),
    "opencode": (".config/opencode/AGENTS.md",),
    "kilo": (".config/kilo/AGENTS.md",),
    "cline": (".cline/AGENTS.md",),
    "claude": (".claude/AGENTS.md",),
}
HOME_INSTRUCTIONS = "AGENTS.md"
# Skills folders other than ~/.agents/skills where a copy would be a twin.
SKILL_TWIN_ROOTS = {
    "omo": (".omo/agent/skills",),
    "opencode": (".config/opencode/skills",),
    "kilo": (".config/kilo/skills",),
    "cline": (".cline/skills",),
}
FIXED_TRACKED = (".gitignore", "skills-lock.json", ".claude/CLAUDE.md")
FIXED_TRACKED_PREFIXES = (".config/ai-config/", ".github/")
# Git skips a hook without the exec bit on Linux/macOS; Windows hides the bit, so the index is checked.
EXECUTABLE_TRACKED = (".config/ai-config/hooks/pre-commit", ".config/ai-config/scripts/setup.sh")
BACKUP_SUFFIXES = (".bak", ".orig", ".old")
BARE_COMMAND = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
BAD_COMMAND_SUFFIXES = (".exe", ".cmd", ".bat", ".ps1", ".sh")


@dataclass
class Cell:
    harness: str
    surface: str
    state: str = OK
    reasons: list[str] = field(default_factory=list)

    def add(self, state: str, reason: str) -> None:
        self.reasons.append(reason)
        order = _PRIORITY
        if self.state == OK or order.index(state) < order.index(self.state):
            self.state = state


class Ctx:
    def __init__(self, home: Path, registry: dict, env: Mapping | None, repo_only: bool):
        self.home = home
        self.reg = registry
        self.env = env
        self.repo_only = repo_only
        self._json: dict[tuple, tuple] = {}

    def path(self, spec_path: str) -> Path:
        return self.home / spec_path.removeprefix("~/")

    def rel(self, spec_path: str) -> str:
        return spec_path.removeprefix("~/")

    def read_json(self, spec: dict, *, track: bool | None = None):
        """Return (object or None, [(state, reason)]) for a registry file."""
        key = (spec["path"], bool(spec.get("json_only")))
        if key in self._json:
            return self._json[key]
        path = self.path(spec["path"])
        problems: list[tuple[str, str]] = []
        obj = None
        if not path.is_file():
            problems.append((MISSING, f"absent: {spec['path']}"))
        else:
            strict = bool(spec.get("json_only")) or path.suffix == ".json"
            try:
                obj = jsonc.parse(
                    path.read_text(encoding="utf-8"),
                    strict=strict,
                    check_duplicates=bool(spec.get("tracked")),
                )
            except jsonc.JsonError as exc:
                problems.append((DRIFT, f"{spec['path']}: {exc}"))
        self._json[key] = (obj, problems)
        return self._json[key]

    def env_set(self, name: str) -> bool:
        if self.env is not None:
            return bool(self.env.get(name))
        if sys.platform == "win32":
            import winreg

            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                    return bool(winreg.QueryValueEx(key, name)[0])
            except FileNotFoundError:
                return False
        return bool(os.environ.get(name))

    def git(self, *args: str) -> subprocess.CompletedProcess:
        repo_git = self.home / "Dev" / "AI-Config" / ".git"
        base = (
            ["git", f"--git-dir={repo_git}", f"--work-tree={self.home}"]
            if repo_git.is_dir()
            else ["git", "-C", str(self.home)]
        )
        return subprocess.run(
            [*base, *args], capture_output=True, text=True, timeout=60,
            stdin=subprocess.DEVNULL, check=False,
        )


# ---------------------------------------------------------------- MCP shape


def _ref_regex(env_ref: str) -> re.Pattern:
    return re.compile("^" + re.escape(env_ref).replace("VAR", "([A-Z][A-Z0-9_]*)") + "$")


def servers_of(ctx: Ctx, harness: str, obj: object) -> dict | None:
    spec = ctx.reg[harness]["mcp"]
    at = spec.get("servers_at") or SERVERS_AT.get(harness, "")
    node = obj
    for part in at.split("."):
        node = node.get(part) if isinstance(node, dict) else None
    return node if isinstance(node, dict) else None


def is_enabled(harness: str, stanza: dict) -> bool:
    off = SHAPES[harness]["off"]
    return not (off and stanza.get(off[0]) == off[1])


def shape_problems(ctx: Ctx, harness: str, name: str, stanza: object) -> list[str]:
    shape = SHAPES[harness]
    shared = ctx.reg["shared"]
    ref_re = _ref_regex(ctx.reg[harness]["mcp"]["env_ref"])
    if not isinstance(stanza, dict):
        return [f"{name}: stanza is not an object"]
    out = []
    for extra in sorted(set(stanza) - shape["allowed"]):
        out.append(f"{name}: key '{extra}' not allowed in the {harness} shape")
    if shape["type"] and stanza.get("type") != shape["type"]:
        out.append(f"{name}: type must be '{shape['type']}'")
    command = stanza.get("command")
    if shape["cmd"] == "list":
        ok = isinstance(command, list) and command and all(isinstance(c, str) for c in command)
        parts = command if ok else []
        binary, rest = (parts[0], parts[1:]) if parts else (None, [])
    else:
        ok = isinstance(command, str)
        args = stanza.get("args", [])
        rest = args if isinstance(args, list) and all(isinstance(a, str) for a in args) else None
        binary = command if ok else None
        if rest is None:
            out.append(f"{name}: args must be a list of strings")
            rest = []
    if not ok:
        out.append(f"{name}: command has the wrong type for the {harness} shape")
    elif not BARE_COMMAND.match(binary) or binary.lower().endswith(BAD_COMMAND_SUFFIXES):
        out.append(f"{name}: command is not a bare binary name")
    for arg in rest:
        if arg.startswith("~") or re.match(r"^([A-Za-z]:[\\/]|/)", arg):
            out.append(f"{name}: an argument is a path")
    env = stanza.get(shape["env"], {})
    if not isinstance(env, dict):
        out.append(f"{name}: {shape['env']} is not an object")
    else:
        for var, value in env.items():
            literal = shared["literal_env"].get(var)
            if isinstance(value, str) and ref_re.match(value):
                continue
            if literal and isinstance(value, str) and re.match(literal, value):
                continue
            out.append(f"{name}: {var} is not an env reference")
    return out


def env_refs(ctx: Ctx, harness: str, servers: dict) -> set[str]:
    ref_re = _ref_regex(ctx.reg[harness]["mcp"]["env_ref"])
    refs = set()
    for stanza in servers.values():
        env = stanza.get(SHAPES[harness]["env"]) if isinstance(stanza, dict) else None
        for value in (env or {}).values():
            if isinstance(value, str) and (m := ref_re.match(value)):
                refs.add(m.group(1))
    return refs


# ------------------------------------------------------------------- cells


def _skip_untracked(ctx: Ctx, spec: dict, cell: Cell) -> bool:
    if ctx.repo_only and not spec.get("tracked"):
        cell.state = NA
        cell.reasons.append("repo-only run: the file is app-owned and lives only on a PC")
        return True
    return False


def _has_content(path: Path) -> bool:
    return path.is_file() and bool(path.read_text(encoding="utf-8", errors="replace").strip())


def check_instructions(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "instructions")
    spec = ctx.reg[h]["instructions"]
    seconds = [*SECOND_INSTRUCTIONS[h], HOME_INSTRUCTIONS]
    for rel in seconds:
        if _has_content(ctx.home / rel):
            cell.add(DRIFT, f"second instruction file has content: ~/{rel}")
    if "na" in spec:
        if cell.state == OK:
            cell.state, cell.reasons = NA, [spec["na"]]
        return cell
    path = ctx.path(spec["path"])
    if not path.is_file():
        cell.add(MISSING, f"absent: {spec['path']}")
    elif not _has_content(path):
        cell.add(DRIFT, f"empty: {spec['path']}")
    if h in ("opencode", "kilo"):
        obj, problems = ctx.read_json(ctx.reg[h]["mcp"])
        for state, reason in problems:
            cell.add(state, reason)
        if obj is not None and obj.get("instructions") != [spec["path"]]:
            cell.add(DRIFT, f"instructions in {ctx.reg[h]['mcp']['path']} is not [{spec['path']}]")
    if h == "claude":
        link = ctx.home / IMPORT_LINE_FILE
        if not link.is_file():
            cell.add(MISSING, f"absent: ~/{IMPORT_LINE_FILE}")
        elif link.read_text(encoding="utf-8").strip() != f"@{spec['path']}":
            cell.add(DRIFT, f"~/{IMPORT_LINE_FILE} is not the single import line @{spec['path']}")
    return cell


def check_mcp(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "mcp")
    spec = ctx.reg[h]["mcp"]
    if "na" in spec:
        cell.state, cell.reasons = NA, [spec["na"]]
        return cell
    if _skip_untracked(ctx, spec, cell):
        return cell
    obj, problems = ctx.read_json(spec)
    for state, reason in problems:
        cell.add(state, reason)
    if obj is None:
        return cell
    servers = servers_of(ctx, h, obj)
    if servers is None:
        cell.add(DRIFT, f"no server table at '{spec.get('servers_at') or SERVERS_AT.get(h)}' in {spec['path']}")
        return cell
    for name, stanza in servers.items():
        for reason in shape_problems(ctx, h, name, stanza):
            cell.add(DRIFT, reason)
    wanted = set(ctx.reg["shared"]["enabled_servers"])
    enabled = {n for n, s in servers.items() if isinstance(s, dict) and is_enabled(h, s)}
    if enabled != wanted:
        cell.add(DRIFT, f"enabled servers are {sorted(enabled)}, expected {sorted(wanted)}")
    if SHAPES[h]["off"] is None:
        if set(servers) != wanted:
            cell.add(DRIFT, f"server set is {sorted(servers)}, expected {sorted(wanted)}")
    elif h != "opencode":
        ref_obj, ref_problems = ctx.read_json(ctx.reg["opencode"]["mcp"])
        ref = servers_of(ctx, "opencode", ref_obj) if ref_obj is not None else None
        if ref is None:
            cell.add(UNKNOWN, "OpenCode's server set (the reference) is unreadable")
        elif set(servers) != set(ref):
            diff = sorted(set(servers) ^ set(ref))
            cell.add(DRIFT, f"server names differ from OpenCode's: {diff}")
    return cell


def check_skills(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "skills")
    spec = ctx.reg[h]["skills"]
    if "na" in spec:
        cell.state, cell.reasons = NA, [spec["na"]]
        return cell
    lock_path = ctx.home / "skills-lock.json"
    if not lock_path.is_file():
        cell.add(MISSING, "absent: ~/skills-lock.json")
        return cell
    try:
        lock = jsonc.parse(lock_path.read_text(encoding="utf-8"), strict=True)
        names = set(lock["skills"])
    except (jsonc.JsonError, KeyError, TypeError) as exc:
        cell.add(DRIFT, f"~/skills-lock.json: {exc}")
        return cell
    if ctx.repo_only:
        cell.state, cell.reasons = NA, ["repo-only run: the installed skills live only on a PC"]
        return cell
    root = ctx.path(spec["path"])
    if not root.is_dir():
        cell.add(MISSING, f"absent: {spec['path']}")
        return cell
    ignored = set(spec.get("exclude", ()))
    present = {p.name for p in root.iterdir() if not p.name.startswith(".")} - ignored
    absent = sorted(n for n in names if not (root / n / "SKILL.md").is_file())
    if absent:
        cell.add(DRIFT, f"{len(absent)} lock skills missing from {spec['path']}: {', '.join(absent[:5])}")
    for stale in sorted(present - names):
        cell.add(DRIFT, f"stale skill not in lock: {stale}; purge it")
    agents_root = os.path.normcase(os.path.realpath(root))
    for twin_rel in SKILL_TWIN_ROOTS.get(h, ()):
        twin_root = ctx.home / twin_rel
        if not twin_root.is_dir():
            continue
        entries = [e for e in twin_root.iterdir() if not e.name.startswith(".")]
        for stale in sorted(e.name for e in entries if e.name not in names):
            cell.add(DRIFT, f"stale skill not in lock: ~/{twin_rel}/{stale}; purge it")
        twins = [
            e.name for e in entries
            if e.name in names
            and not os.path.normcase(os.path.realpath(e)).startswith(agents_root + os.sep)
        ]
        if twins:
            cell.add(DRIFT, f"twin copies under ~/{twin_rel}: {', '.join(sorted(twins)[:5])}")
    if h == "omo":
        _omo_skill_filter(ctx, cell, present)
    return cell


def _omo_skill_filter(ctx: Ctx, cell: Cell, present: set) -> None:
    # omo.jsonc disabled_skills filters bundled skills only; the core
    # filter for ~/.agents/skills is `skills` in agent/settings.jsonc.
    try:
        omo_cfg = jsonc.parse((ctx.home / ".omo/omo.jsonc").read_text(encoding="utf-8"), strict=False)
        core_cfg = jsonc.parse((ctx.home / ".omo/agent/settings.jsonc").read_text(encoding="utf-8"), strict=False)
    except (OSError, jsonc.JsonError, TypeError, AttributeError) as exc:
        cell.add(DRIFT, f"omo skill filter unreadable: {exc}")
        return
    patterns = set(core_cfg.get("skills") or ())
    for name in sorted(set(omo_cfg.get("disabled_skills") or ()) & present):
        if not patterns & {f"!**/{name}", f"!{name}", f"!**/{name}/**"}:
            cell.add(DRIFT, f'disabled skill visible in omo: {name}; add "!**/{name}" to ~/.omo/agent/settings.jsonc skills')


def _config_files(ctx: Ctx, h: str):
    """Yield (spec, path) for every file the harness's `files` entries cover."""
    for spec in ctx.reg[h]["files"]:
        path = ctx.path(spec["path"])
        if path.is_dir():
            for inner in sorted(path.rglob("*")):
                if inner.is_file():
                    yield {**spec, "path": spec["path"] + "/" + inner.relative_to(path).as_posix()}, inner
        else:
            yield spec, path


def check_config(ctx: Ctx, h: str, tracked_set_problems: list[tuple[str | None, str]]) -> Cell:
    cell = Cell(h, "config")
    for spec in ctx.reg[h]["files"]:
        if _skip_untracked(ctx, spec, Cell(h, "config")):
            continue
        path = ctx.path(spec["path"])
        if not path.exists():
            if not spec.get("optional"):
                cell.add(MISSING, f"absent: {spec['path']}")
    for spec, path in _config_files(ctx, h):
        if ctx.repo_only and not spec.get("tracked"):
            continue
        for sibling in path.parent.glob(path.stem + ".*"):
            if sibling != path and {sibling.suffix, path.suffix} == {".json", ".jsonc"}:
                cell.add(DRIFT, f"two files for one stem: {path.name} and {sibling.name}")
        for suffix in BACKUP_SUFFIXES:
            if (path.parent / (path.name + suffix)).exists():
                cell.add(DRIFT, f"backup artifact: {path.name}{suffix}")
        if path.suffix in (".json", ".jsonc"):
            _, problems = ctx.read_json(spec)
            for state, reason in problems:
                cell.add(state, reason)
    for owner, reason in tracked_set_problems:
        if owner in (None, h):
            cell.add(DRIFT, reason)
    return cell


def check_secrets(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "secrets")
    spec = ctx.reg[h]["mcp"]
    if "na" in spec:
        cell.state, cell.reasons = NA, [spec["na"]]
        return cell
    if _skip_untracked(ctx, spec, cell):
        return cell
    obj, problems = ctx.read_json(spec)
    for state, reason in problems:
        cell.add(state, reason)
    if obj is not None:
        servers = servers_of(ctx, h, obj) or {}
        text = (
            ctx.path(spec["path"]).read_text(encoding="utf-8")
            if spec.get("tracked")
            else json.dumps(servers, indent=1)
        )
        for finding in scan_text(spec["path"], text):
            cell.add(DRIFT, f"literal secret: {finding}")
        if not ctx.repo_only:
            for var in sorted(env_refs(ctx, h, servers)):
                if not ctx.env_set(var):
                    cell.add(MISSING, f"env var not set in the user environment: {var}")
    for file_spec, path in _config_files(ctx, h):
        if file_spec.get("tracked") and path.is_file() and file_spec["path"] != spec["path"]:
            for finding in scan_text(file_spec["path"], path.read_text(encoding="utf-8", errors="replace")):
                cell.add(DRIFT, f"literal secret: {finding}")
    return cell


# ------------------------------------------------------- tracked-set parity


def registry_tracked(ctx: Ctx) -> list[tuple[str, str]]:
    out = []
    for h in HARNESSES:
        for surface in ("instructions", "mcp", "skills"):
            spec = ctx.reg[h][surface]
            if spec.get("tracked"):
                out.append((h, ctx.rel(spec["path"])))
        out += [(h, ctx.rel(s["path"])) for s in ctx.reg[h]["files"] if s.get("tracked")]
    return out


def tracked_set_problems(ctx: Ctx) -> list[tuple[str | None, str]]:
    """Disagreements between the .gitignore allowlist and harnesses.toml."""
    if not (ctx.home / ".gitignore").is_file():
        return [(None, "absent: ~/.gitignore")]
    allowed_run = ctx.git("ls-files", "--cached", "--others", "--exclude-standard")
    if allowed_run.returncode != 0:
        return [(None, "tracked set unreadable: git ls-files failed")]
    allowed = {p.casefold() for p in allowed_run.stdout.splitlines()}
    reg = registry_tracked(ctx)
    exact = {p.casefold() for _, p in reg}
    problems: list[tuple[str | None, str]] = []
    for path in sorted(allowed):
        covered = (
            path in exact
            or path in {f.casefold() for f in FIXED_TRACKED}
            or path.startswith(FIXED_TRACKED_PREFIXES)
            or any(path.startswith(e + "/") for e in exact)
        )
        if not covered:
            problems.append((None, f"allowlisted in .gitignore but not in harnesses.toml: {path}"))
    for owner, rel in reg:
        target = ctx.home / rel
        if not target.exists():
            continue
        probe = rel + "/x" if target.is_dir() else rel
        if ctx.git("check-ignore", "-q", probe).returncode == 0:
            problems.append((owner, f"in harnesses.toml but excluded by .gitignore: {rel}"))
    for rel in EXECUTABLE_TRACKED:
        staged = ctx.git("ls-files", "-s", "--", rel)
        mode = staged.stdout.split(" ", 1)[0] if staged.returncode == 0 else ""
        if mode and mode != "100755":
            problems.append((None, f"git index mode of {rel} is {mode}, must be 100755 (git update-index --chmod=+x)"))
    return problems


# --------------------------------------------------------------------- run


def run(home: Path, registry: dict, env: Mapping | None = None, repo_only: bool = False) -> list[Cell]:
    ctx = Ctx(home, registry, env, repo_only)
    try:
        set_problems = tracked_set_problems(ctx)
    except (OSError, subprocess.SubprocessError) as exc:
        set_problems = [(None, f"tracked set unreadable: {type(exc).__name__}")]
    checks = {
        "instructions": check_instructions,
        "mcp": check_mcp,
        "skills": check_skills,
        "config": lambda c, h: check_config(c, h, set_problems),
        "secrets": check_secrets,
    }
    cells = []
    for h in HARNESSES:
        for surface in SURFACES:
            try:
                cell = checks[surface](ctx, h)
            except Exception as exc:  # a failed check is UNKNOWN, never OK
                cell = Cell(h, surface, UNKNOWN, [f"{type(exc).__name__}: {exc}"])
            cells.append(cell)
    return cells


def render(cells: list[Cell]) -> str:
    lines = [f"{'HARNESS':<9} {'SURFACE':<13} {'STATE':<8} DETAIL"]
    for c in cells:
        lines.append(f"{c.harness:<9} {c.surface:<13} {c.state:<8} {c.reasons[0] if c.reasons else ''}")
        lines += [f"{'':<32}{r}" for r in c.reasons[1:]]
    return "\n".join(lines)


def exit_code(cells: list[Cell]) -> int:
    return 0 if all(c.state in (OK, NA) for c in cells) else 1


def main(argv: list[str] | None = None, env: Mapping | None = None) -> int:
    parser = argparse.ArgumentParser(description="ai-config doctor: 25-cell parity check")
    parser.add_argument("--json", action="store_true", help="print JSON instead of the table")
    parser.add_argument("--repo-only", action="store_true", help="check only what needs no live PC (CI)")
    parser.add_argument("--home", type=Path, default=Path.home(), help="home folder to check")
    args = parser.parse_args(argv)
    registry = tomllib.loads((CONFIG_DIR / "harnesses.toml").read_text(encoding="utf-8"))
    cells = run(args.home, registry, env, args.repo_only)
    code = exit_code(cells)
    if args.json:
        print(json.dumps({
            "mode": "repo-only" if args.repo_only else "live",
            "exit": code,
            "cells": [{"harness": c.harness, "surface": c.surface, "state": c.state, "reasons": c.reasons} for c in cells],
        }, indent=2))
    else:
        print(render(cells))
        counts = {s: sum(c.state == s for c in cells) for s in (OK, DRIFT, MISSING, NA, UNKNOWN)}
        print("\n" + "  ".join(f"{s}={n}" for s, n in counts.items()) + f"  exit={code}")
    return code


if __name__ == "__main__":
    sys.exit(main())
