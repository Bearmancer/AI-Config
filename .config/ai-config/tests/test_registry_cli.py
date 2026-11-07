"""Setup registry reader: shared.enabled_servers through the CLI and function."""

import subprocess
import sys
from pathlib import Path

from scripts.registry_cli import enabled_servers

CONFIG_DIR = Path(__file__).resolve().parent.parent
SCRIPT = CONFIG_DIR / "scripts/registry_cli.py"


def write_registry(tmp_path: Path, servers: list[str]) -> Path:
    path = tmp_path / "harnesses.yaml"
    body = "\n".join(f"    - {name}" for name in servers)
    path.write_text(
        f"shared:\n  enabled_servers:\n{body}\nomo: {{}}\n", encoding="utf-8"
    )
    return path


def test_enabled_servers_reads_shared(tmp_path):
    path = write_registry(tmp_path, ["codegraph", "other"])
    assert enabled_servers(path) == ["codegraph", "other"]


def test_cli_prints_one_server_per_line(tmp_path):
    path = write_registry(tmp_path, ["codegraph", "other"])
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "enabled-servers", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.splitlines() == ["codegraph", "other"]
