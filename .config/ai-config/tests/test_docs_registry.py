"""Docs name the YAML registry and link ADR 0022."""

from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent
DOCS = [
    CONFIG_DIR / "README.md",
    CONFIG_DIR / "GLOSSARY.md",
    CONFIG_DIR / "docs/adr/0002-harness-registry-and-tests.md",
    CONFIG_DIR / "docs/adr/0007-status-matrix.md",
    CONFIG_DIR / "docs/adr/0020-harness-table-owns-files-and-plugins.md",
    CONFIG_DIR / "docs/adr/README.md",
]


def test_live_docs_name_yaml_not_toml():
    for path in DOCS:
        text = path.read_text(encoding="utf-8")
        assert "harnesses.toml" not in text, path
        assert "tomllib" not in text, path


def test_adr_0022_exists_and_is_linked():
    adr = CONFIG_DIR / "docs/adr/0022-yaml-registry.md"
    assert adr.exists()
    assert "0022-yaml-registry.md" in (CONFIG_DIR / "docs/adr/README.md").read_text(
        encoding="utf-8"
    )
