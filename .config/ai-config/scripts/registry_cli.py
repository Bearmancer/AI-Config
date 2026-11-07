"""Read the harness registry for the setup scripts."""

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True
CONFIG_DIR = Path(__file__).resolve().parent.parent
if str(CONFIG_DIR) not in sys.path:
    sys.path.insert(0, str(CONFIG_DIR))

from lib.yaml_config import load_registry  # noqa: E402


def enabled_servers(path: str | Path) -> list[str]:
    """Return ``shared.enabled_servers`` from the registry at ``path``."""
    servers = load_registry(path)["shared"].get("enabled_servers")
    if not isinstance(servers, list) or not all(isinstance(s, str) for s in servers):
        raise ValueError("shared.enabled_servers must be a list of strings")
    return servers


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="registry_cli")
    sub = parser.add_subparsers(dest="command", required=True)
    command = sub.add_parser("enabled-servers", help="print enabled MCP servers")
    command.add_argument("path", type=Path)
    args = parser.parse_args(argv)
    try:
        print("\n".join(enabled_servers(args.path)))
    except (OSError, ValueError) as exc:
        parser.exit(2, f"registry: {exc}\n")


if __name__ == "__main__":
    main()
