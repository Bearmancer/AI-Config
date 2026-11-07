"""Generate and check ~/.commandcode/omo-memory.md, the read-only OMO bridge.

The bridge holds only @imports of OMO's standing memory, so Command Code reads
the same rules without the home repo owning the OMO memory repository. Setup
writes it; doctor re-derives the body and reports DRIFT on any difference.

    uv run --no-project python ~/.config/ai-config/scripts/commandcode_memory.py --write
    uv run --no-project python ~/.config/ai-config/scripts/commandcode_memory.py --check
"""

import argparse
import sys
from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent
if str(CONFIG_DIR) not in sys.path:
    sys.path.insert(0, str(CONFIG_DIR))

from lib import jsonc  # noqa: E402

SOURCES = (
    "system/preferences.md",
    "system/agreements.md",
    "system/boundaries.md",
    "system/human.md",
    "system/persona.md",
    "system/self-aware.md",
    "people/human/observations.md",
)
BRIDGE = ".commandcode/omo-memory.md"
HEADER = "# OMO standing memory (generated; edit the OMO memory repo instead)"


def memory_repo(home: Path) -> tuple[Path | None, str | None]:
    """Resolve the local OMO memory repo from ~/.omo/omo.jsonc memory.agent."""
    agents = home / ".omo/memory/agents"
    agent = None
    config = home / ".omo/omo.jsonc"
    if config.is_file():
        try:
            doc = jsonc.parse(config.read_text(encoding="utf-8"), strict=False)
            if not isinstance(doc, dict):
                raise TypeError("omo.jsonc must be a mapping")
            memory = doc.get("memory")
            agent = memory.get("agent") if isinstance(memory, dict) else None
        except (jsonc.JsonError, OSError, TypeError, AttributeError):
            agent = None
    if agent:
        roots = sorted(agents.glob(f"{agent}-*/repo")) if agents.is_dir() else []
    else:
        roots = sorted(agents.glob("*/repo")) if agents.is_dir() else []
        if len(roots) != 1:
            return None, None
    if not roots:
        return None, None
    return roots[0], roots[0].parent.name


def _display(home: Path, path: Path) -> str:
    try:
        return "~/" + path.relative_to(home).as_posix()
    except ValueError:
        return path.as_posix()


def body(home: Path, root: Path | None = None) -> str:
    if root is None:
        root, _ = memory_repo(home)
    lines = [HEADER, ""]
    if root is None:
        lines.append("No OMO memory repository found.")
        return "\n".join(lines) + "\n"
    for rel in SOURCES:
        source = root / rel
        if source.is_file():
            lines.append(f"@{_display(home, source)}")
        else:
            lines.append(f"<!-- missing: {rel} -->")
    return "\n".join(lines) + "\n"


def check_problems(home: Path, root: Path | None = None) -> list[str]:
    if root is None:
        root, _ = memory_repo(home)
    if root is None:
        # Nothing to mirror on this PC: the bridge records the absence and is
        # stable, so the surface is not drift until a memory repo appears.
        path = home / BRIDGE
        if not path.is_file():
            return [f"absent: ~/{BRIDGE}"]
        return [] if path.read_text(encoding="utf-8") == body(home, None) else [
            f"~/{BRIDGE} is stale; run commandcode_memory.py --write"
        ]
    problems = [
        f"missing OMO memory source: {rel}" for rel in SOURCES if not (root / rel).is_file()
    ]
    path = home / BRIDGE
    if not path.is_file():
        problems.append(f"absent: ~/{BRIDGE}")
    elif path.read_text(encoding="utf-8") != body(home, root):
        problems.append(f"~/{BRIDGE} is stale; run commandcode_memory.py --write")
    return problems


def write(home: Path, root: Path | None = None) -> Path:
    path = home / BRIDGE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body(home, root), encoding="utf-8", newline="\n")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OMO memory bridge for Command Code")
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--root", type=Path, help="override the OMO memory repo root")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true", help="regenerate the bridge")
    group.add_argument("--check", action="store_true", help="fail when the bridge is stale")
    args = parser.parse_args(argv)
    if args.write:
        print(write(args.home, args.root))
        return 0
    problems = check_problems(args.home, args.root)
    for problem in problems:
        print(f"ERROR {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
