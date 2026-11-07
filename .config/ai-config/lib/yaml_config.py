"""Load the harness registry from YAML.

The registry is read-only: one top-level mapping, a required ``shared``
mapping, and no duplicate keys. A malformed registry is a hard error, never a
silently partial mapping.
"""

from pathlib import Path

import yaml
from yaml.resolver import BaseResolver


class _UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader that rejects a duplicate mapping key instead of overwriting."""


def _construct_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f"duplicate key {key!r}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeyLoader.add_constructor(
    BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


def load_registry(path: str | Path) -> dict:
    """Load ``path`` as the registry; raise ``ValueError`` on an invalid shape."""
    path = Path(path)
    try:
        data = yaml.load(path.read_text(encoding="utf-8"), Loader=_UniqueKeyLoader)
    except yaml.YAMLError as exc:
        raise ValueError(f"{path}: invalid YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"{path}: registry must be a mapping")
    if "shared" not in data:
        raise ValueError(f"{path}: registry missing shared")
    if not isinstance(data["shared"], dict):
        raise ValueError(f"{path}: registry shared must be a mapping")
    return data
