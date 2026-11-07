"""Cutover: YAML is present and tracked; the TOML registry is gone."""

from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent
ROOT = CONFIG_DIR.parents[1]
NEW_FILES = [
    ".config/ai-config/harnesses.yaml",
    ".config/ai-config/lib/yaml_config.py",
    ".config/ai-config/scripts/registry_cli.py",
    ".config/ai-config/docs/adr/0022-yaml-registry.md",
    ".config/ai-config/tests/test_docs_registry.py",
    ".config/ai-config/tests/test_entrypoints.py",
    ".config/ai-config/tests/test_registry_cli.py",
    ".config/ai-config/tests/test_registry_cutover.py",
    ".config/ai-config/tests/test_registry_schema.py",
    ".config/ai-config/tests/test_yaml_config.py",
]


def test_yaml_registry_exists():
    assert (CONFIG_DIR / "harnesses.yaml").exists()


def test_toml_registry_is_gone():
    assert not (CONFIG_DIR / "harnesses.toml").exists()


def test_allowlist_admits_yaml_and_new_files():
    text = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for rel in NEW_FILES:
        assert f"!/{rel}" in text, rel
