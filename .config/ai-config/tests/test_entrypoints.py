"""Entrypoints: every YAML reader runs in the project env; redaction stays plain."""

from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent
HOOK = CONFIG_DIR / "hooks/pre-commit"
README = CONFIG_DIR / "README.md"


def test_hook_uses_project_env():
    text = HOOK.read_text(encoding="utf-8")
    assert 'uv run --project "$cfg" python "$cfg/tests/doctor.py"' in text
    assert 'uv run --project "$cfg" pytest' in text
    assert 'uv run --no-project python "$cfg/scripts/scan_staged.py"' in text


def test_no_ci_workflow():
    assert not (CONFIG_DIR.parents[1] / ".github/workflows").exists()


def test_readme_commands_use_project_env():
    text = README.read_text(encoding="utf-8")
    assert "uv run --project ~/.config/ai-config python ~/.config/ai-config/tests/doctor.py" in text
    assert "uv run --project ~/.config/ai-config pytest -q ~/.config/ai-config/tests" in text
