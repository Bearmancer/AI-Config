"""Registry: it loads hard or not at all, and it feeds doctor the six harnesses."""

from pathlib import Path

import pytest

from lib.redaction import scan_text
from lib.yaml_config import load_registry

CONFIG_DIR = Path(__file__).resolve().parent.parent
YAML = CONFIG_DIR / "harnesses.yaml"
HARNESSES = ["omo", "opencode", "kilo", "cline", "claude", "commandcode"]


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "harnesses.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def test_order_and_cells():
    registry = load_registry(YAML)
    assert list(registry) == ["shared", *HARNESSES]
    for name in HARNESSES:
        assert set(registry[name]) >= {"instructions", "mcp", "skills", "files"}
        assert isinstance(registry[name]["files"], list)
    assert len(registry["shared"]["canonical_servers"]) == 12


def test_no_literal_secret():
    assert scan_text("harnesses.yaml", YAML.read_text(encoding="utf-8")) == []


def test_bad_shapes_are_hard_errors(tmp_path):
    for text, match in [
        ("- shared\n", "mapping"),
        ("omo: {}\n", "shared"),
        ("shared: []\n", "shared"),
        ("shared: {}\nshared: {}\n", "duplicate key"),
        ("shared: [unclosed\n", "YAML"),
    ]:
        with pytest.raises(ValueError, match=match):
            load_registry(write(tmp_path, text))
