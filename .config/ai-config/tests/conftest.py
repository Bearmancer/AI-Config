"""Make ``lib`` importable and keep test runs from writing bytecode or caches."""

import os
import sys
from pathlib import Path

import pytest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(autouse=True)
def _isolate_git(monkeypatch):
    """The pre-commit hook exports GIT_DIR and friends; a fake-home `git init`
    would otherwise rewrite the real repo's core.worktree."""
    for name in list(os.environ):
        if name.startswith("GIT_"):
            monkeypatch.delenv(name)
