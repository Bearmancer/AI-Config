"""Registry schema: stable order, four cells per harness, no literal secrets."""

from pathlib import Path

from lib.redaction import scan_text
from lib.yaml_config import load_registry

CONFIG_DIR = Path(__file__).resolve().parent.parent
YAML = CONFIG_DIR / "harnesses.yaml"
HARNESSES = ["omo", "opencode", "kilo", "cline", "claude", "commandcode"]


def test_top_level_order_is_stable():
    assert list(load_registry(YAML)) == ["shared", *HARNESSES]


def test_every_harness_has_the_four_cells():
    registry = load_registry(YAML)
    for name in HARNESSES:
        assert set(registry[name]) >= {"instructions", "mcp", "skills", "files"}
        assert isinstance(registry[name]["files"], list)


def test_registry_has_no_literal_secret():
    assert scan_text("harnesses.yaml", YAML.read_text(encoding="utf-8")) == []
