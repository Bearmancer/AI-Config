"""Entrypoints: every YAML reader is invoked with PyYAML; redaction stays plain."""

from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent
HOOK = CONFIG_DIR / "hooks/pre-commit"
CI = CONFIG_DIR.parents[1] / ".github/workflows/test.yml"
README = CONFIG_DIR / "README.md"


def test_hook_runs_yaml_readers_with_pyyaml():
    text = HOOK.read_text(encoding="utf-8")
    assert 'uv run --no-project --with pyyaml python "$cfg/scripts/doctor.py"' in text
    assert "uv run --no-project --with pyyaml --with pytest pytest" in text
    assert 'uv run --no-project python "$cfg/scripts/scan_staged.py"' in text


def test_ci_runs_yaml_readers_with_pyyaml():
    text = CI.read_text(encoding="utf-8")
    assert "uv run --no-project --with pyyaml --with pytest pytest" in text
    assert "uv run --no-project --with pyyaml python .config/ai-config/scripts/doctor.py --repo-only" in text


def test_readme_commands_use_pyyaml():
    text = README.read_text(encoding="utf-8")
    assert "uv run --no-project --with pyyaml python ~/.config/ai-config/scripts/doctor.py" in text
    assert "uv run --no-project --with pyyaml --with pytest pytest -q ~/.config/ai-config/tests" in text
