"""Tests for the generated Command Code OMO memory bridge."""

import json
from pathlib import Path

from scripts import commandcode_memory


def make_home(tmp_path, config=None, with_repo=True):
    home = tmp_path / "home"
    home.mkdir()
    (home / ".omo").mkdir()
    (home / ".omo/omo.jsonc").write_text(json.dumps(config or {}), encoding="utf-8")
    root = home / ".omo/memory/agents/global-1-abcd/repo"
    if with_repo:
        for rel in commandcode_memory.SOURCES:
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"# {rel}\n", encoding="utf-8")
    return home, root


def test_write_then_check_is_clean(tmp_path):
    home, _ = make_home(tmp_path, {"memory": {"agent": "global-1"}})
    bridge = commandcode_memory.write(home)
    assert bridge == home / ".commandcode/omo-memory.md"
    assert commandcode_memory.check_problems(home) == []
    assert "@~/.omo/memory/agents/global-1-abcd/repo/system/preferences.md" in bridge.read_text(
        encoding="utf-8"
    )


def test_check_detects_stale_body(tmp_path):
    home, _ = make_home(tmp_path, {"memory": {"agent": "global-1"}})
    bridge = commandcode_memory.write(home)
    bridge.write_text(bridge.read_text(encoding="utf-8") + "@extra\n", encoding="utf-8")
    problems = commandcode_memory.check_problems(home)
    assert any("stale" in problem for problem in problems)


def test_single_repo_without_agent_setting_is_used(tmp_path):
    home, _ = make_home(tmp_path)
    commandcode_memory.write(home)
    assert commandcode_memory.check_problems(home) == []


def test_missing_source_is_reported(tmp_path):
    home, root = make_home(tmp_path, {"memory": {"agent": "global-1"}})
    (root / "system/preferences.md").unlink()
    problems = commandcode_memory.check_problems(home)
    assert any("missing OMO memory source: system/preferences.md" in p for p in problems)


def test_absent_memory_repo_is_stable_and_not_drift(tmp_path):
    home, _ = make_home(tmp_path, {"memory": {"agent": "global-1"}}, with_repo=False)
    commandcode_memory.write(home)
    assert commandcode_memory.check_problems(home) == []
    assert "No OMO memory repository found." in (home / ".commandcode/omo-memory.md").read_text(
        encoding="utf-8"
    )
