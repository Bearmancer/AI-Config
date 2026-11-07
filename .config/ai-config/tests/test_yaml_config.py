"""Registry loader tests: YAML mapping, required shared table, duplicate keys."""

from pathlib import Path

import pytest

from lib.yaml_config import load_registry


def write_registry(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "harnesses.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def test_loads_mapping_and_preserves_order(tmp_path):
    path = write_registry(
        tmp_path,
        "shared:\n  enabled_servers: [codegraph]\nomo:\n  instructions: {na: reason}\n",
    )
    registry = load_registry(path)
    assert list(registry) == ["shared", "omo"]
    assert registry["shared"]["enabled_servers"] == ["codegraph"]


def test_rejects_non_mapping(tmp_path):
    path = write_registry(tmp_path, "- shared\n")
    with pytest.raises(ValueError, match="mapping"):
        load_registry(path)


def test_rejects_missing_shared(tmp_path):
    path = write_registry(tmp_path, "omo: {}\n")
    with pytest.raises(ValueError, match="shared"):
        load_registry(path)


def test_rejects_non_mapping_shared(tmp_path):
    path = write_registry(tmp_path, "shared: []\n")
    with pytest.raises(ValueError, match="shared"):
        load_registry(path)


def test_rejects_duplicate_keys(tmp_path):
    path = write_registry(tmp_path, "shared: {}\nshared: {}\n")
    with pytest.raises(ValueError, match="duplicate key"):
        load_registry(path)


def test_rejects_invalid_yaml(tmp_path):
    path = write_registry(tmp_path, "shared: [unclosed\n")
    with pytest.raises(ValueError, match="YAML"):
        load_registry(path)
