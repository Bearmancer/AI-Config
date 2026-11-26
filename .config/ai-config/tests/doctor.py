"""ai-config doctor: one parity cell per harness per surface, essentials only.

Reads harnesses.yaml and the live files. Prints one row per cell and exits 0
only when every cell is OK or NA. It never writes or fixes anything and never
prints a secret value (only variable names, file names and line numbers).

Checks: a registered file is present and parses; OpenCode and Kilo point their
`instructions` key at ~/.agents/AGENTS.md; Claude's CLAUDE.md is the single
import line; omo, Kilo and Cline define the same MCP server names as OpenCode;
every skills-lock skill is installed; tracked files carry no literal secret.

States: OK, DRIFT (present but wrong), MISSING (absent; never OK),
NA (the harness cannot take the surface; the reason comes from harnesses.yaml),
UNKNOWN (the check itself failed).

    uv run --project ~/.config/ai-config python ~/.config/ai-config/tests/doctor.py
"""

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.dont_write_bytecode = True
CONFIG_DIR = Path(__file__).resolve().parent.parent
if str(CONFIG_DIR) not in sys.path:
    sys.path.insert(0, str(CONFIG_DIR))

from lib import jsonc  # noqa: E402
from lib.redaction import scan_text  # noqa: E402
from lib.yaml_config import load_registry  # noqa: E402

SURFACES = ("instructions", "mcp", "skills", "config", "secrets")
OK, DRIFT, MISSING, NA, UNKNOWN = "OK", "DRIFT", "MISSING", "NA", "UNKNOWN"
_PRIORITY = (MISSING, DRIFT, UNKNOWN)

# Harnesses whose MCP file must define the same server names as OpenCode's.
# Claude holds the enabled set alone (no per-server flag); Command Code keeps
# its own set (it adds linear and enables its research and web lanes).
PARITY_HARNESSES = ("omo", "kilo", "cline")
IMPORT_LINE_FILE = ".claude/CLAUDE.md"


def harness_names(registry: dict) -> list[str]:
    """Every harness mapping in harnesses.yaml, in file order."""
    return [name for name in registry if name != "shared"]


@dataclass
class Cell:
    harness: str
    surface: str
    state: str = OK
    reasons: list[str] = field(default_factory=list)

    def add(self, state: str, reason: str) -> None:
        self.reasons.append(reason)
        if self.state == OK or _PRIORITY.index(state) < _PRIORITY.index(self.state):
            self.state = state


class Ctx:
    def __init__(self, home: Path, registry: dict):
        self.home = home
        self.reg = registry
        self._json: dict[tuple, tuple] = {}

    def path(self, spec_path: str) -> Path:
        return self.home / spec_path.removeprefix("~/")

    def read_json(self, spec: dict):
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


def servers_of(ctx: Ctx, harness: str, obj: object) -> dict | None:
    at = ctx.reg[harness]["mcp"].get("servers_at", "mcpServers")
    node = obj
    for part in at.split("."):
        node = node.get(part) if isinstance(node, dict) else None
    return node if isinstance(node, dict) else None


def _has_content(path: Path) -> bool:
    return path.is_file() and bool(
        path.read_text(encoding="utf-8", errors="replace").strip()
    )


def check_instructions(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "instructions")
    spec = ctx.reg[h]["instructions"]
    if "na" in spec:
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
            cell.add(
                DRIFT,
                f"instructions in {ctx.reg[h]['mcp']['path']} is not [{spec['path']}]",
            )
    if h == "claude":
        link = ctx.home / IMPORT_LINE_FILE
        if not link.is_file():
            cell.add(MISSING, f"absent: ~/{IMPORT_LINE_FILE}")
        elif link.read_text(encoding="utf-8").strip() != f"@{spec['path']}":
            cell.add(
                DRIFT,
                f"~/{IMPORT_LINE_FILE} is not the single import line @{spec['path']}",
            )
    return cell


def check_mcp(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "mcp")
    spec = ctx.reg[h]["mcp"]
    if "na" in spec:
        cell.state, cell.reasons = NA, [spec["na"]]
        return cell
    obj, problems = ctx.read_json(spec)
    for state, reason in problems:
        cell.add(state, reason)
    if obj is None:
        return cell
    servers = servers_of(ctx, h, obj)
    if servers is None:
        cell.add(DRIFT, f"no server table at '{spec.get('servers_at')}' in {spec['path']}")
        return cell
    canonical = set(ctx.reg["shared"].get("canonical_servers") or ())
    names = set(servers)
    if canonical and not canonical <= names and h != "claude":
        cell.add(DRIFT, f"missing canonical servers: {sorted(canonical - names)}")
    if h in PARITY_HARNESSES:
        ref_obj, _ = ctx.read_json(ctx.reg["opencode"]["mcp"])
        ref = servers_of(ctx, "opencode", ref_obj) if ref_obj is not None else None
        if ref is None:
            cell.add(UNKNOWN, "OpenCode's server set (the reference) is unreadable")
        elif not names <= set(ref):
            cell.add(DRIFT, f"servers beyond OpenCode's set: {sorted(names - set(ref))}")
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
        skills = lock.get("skills") if isinstance(lock, dict) else None
        if not isinstance(skills, dict):
            raise TypeError("skills-lock.json skills must be a mapping")
        names = set(skills)
    except (jsonc.JsonError, KeyError, TypeError) as exc:
        cell.add(DRIFT, f"~/skills-lock.json: {exc}")
        return cell
    root = ctx.path(spec["path"])
    if not root.is_dir():
        cell.add(MISSING, f"absent: {spec['path']}")
        return cell
    ignored = set(spec.get("exclude", ()))
    absent = sorted(
        n
        for n in names
        if not (root / n / "SKILL.md").is_file()
        and not (n in ignored)
    )
    if absent:
        cell.add(
            DRIFT,
            f"{len(absent)} lock skills missing from {spec['path']}: {', '.join(absent[:5])}",
        )
    return cell


def _config_files(ctx: Ctx, h: str):
    """Yield (spec, path) for every file the harness's `files` entries cover."""
    for spec in ctx.reg[h]["files"]:
        path = ctx.path(spec["path"])
        if path.is_dir():
            for inner in sorted(path.rglob("*")):
                if inner.is_file():
                    yield (
                        {
                            **spec,
                            "path": spec["path"]
                            + "/"
                            + inner.relative_to(path).as_posix(),
                        },
                        inner,
                    )
        else:
            yield spec, path


def check_config(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "config")
    for spec in ctx.reg[h]["files"]:
        path = ctx.path(spec["path"])
        if not path.exists() and not spec.get("optional"):
            cell.add(MISSING, f"absent: {spec['path']}")
    for spec, path in _config_files(ctx, h):
        if path.suffix in (".json", ".jsonc") and path.is_file():
            _, problems = ctx.read_json(spec)
            for state, reason in problems:
                cell.add(state, reason)
    return cell


def check_secrets(ctx: Ctx, h: str) -> Cell:
    cell = Cell(h, "secrets")
    spec = ctx.reg[h]["mcp"]
    if "na" in spec:
        cell.state, cell.reasons = NA, [spec["na"]]
        return cell
    mcp_path = ctx.path(spec["path"])
    if mcp_path.is_file():
        for finding in scan_text(
            spec["path"], mcp_path.read_text(encoding="utf-8", errors="replace")
        ):
            cell.add(DRIFT, f"literal secret: {finding}")
    for file_spec, path in _config_files(ctx, h):
        if path.is_file() and file_spec["path"] != spec["path"]:
            for finding in scan_text(
                file_spec["path"], path.read_text(encoding="utf-8", errors="replace")
            ):
                cell.add(DRIFT, f"literal secret: {finding}")
    return cell


def run(home: Path, registry: dict) -> list[Cell]:
    ctx = Ctx(home, registry)
    checks = {
        "instructions": check_instructions,
        "mcp": check_mcp,
        "skills": check_skills,
        "config": check_config,
        "secrets": check_secrets,
    }
    cells = []
    for h in harness_names(registry):
        for surface in SURFACES:
            try:
                cell = checks[surface](ctx, h)
            except Exception as exc:  # a failed check is UNKNOWN, never OK
                cell = Cell(h, surface, UNKNOWN, [f"{type(exc).__name__}: {exc}"])
            cells.append(cell)
    return cells


def render(cells: list[Cell]) -> str:
    lines = [f"{'HARNESS':<12} {'SURFACE':<13} {'STATE':<8} DETAIL"]
    for c in cells:
        lines.append(
            f"{c.harness:<12} {c.surface:<13} {c.state:<8} {c.reasons[0] if c.reasons else ''}"
        )
        lines += [f"{'':<35}{r}" for r in c.reasons[1:]]
    return "\n".join(lines)


def exit_code(cells: list[Cell]) -> int:
    return 0 if all(c.state in (OK, NA) for c in cells) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="ai-config doctor: one parity cell per harness per surface"
    )
    parser.add_argument(
        "--home", type=Path, default=Path.home(), help="home folder to check"
    )
    args = parser.parse_args(argv)
    registry = load_registry(CONFIG_DIR / "harnesses.yaml")
    cells = run(args.home, registry)
    code = exit_code(cells)
    print(render(cells))
    counts = {s: sum(c.state == s for c in cells) for s in (OK, DRIFT, MISSING, NA, UNKNOWN)}
    print("\n" + "  ".join(f"{s}={n}" for s, n in counts.items()) + f"  exit={code}")
    return code


if __name__ == "__main__":
    sys.exit(main())
