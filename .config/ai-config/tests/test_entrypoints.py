"""Entrypoints: every YAML reader runs in the project env; redaction stays plain."""

from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent
HOOK = CONFIG_DIR / "hooks/pre-commit"
CI = CONFIG_DIR.parents[1] / ".github/workflows/test.yml"
README = CONFIG_DIR / "README.md"


def test_hook_uses_project_env():
    text = HOOK.read_text(encoding="utf-8")
    assert 'uv run --project "$cfg" python "$cfg/scripts/doctor.py"' in text
    assert 'uv run --project "$cfg" pytest' in text
    assert 'uv run --no-project python "$cfg/scripts/scan_staged.py"' in text


def test_ci_uses_project_env():
    text = CI.read_text(encoding="utf-8")
    assert "uv run --project .config/ai-config pytest" in text
    assert "uv run --project .config/ai-config python .config/ai-config/scripts/doctor.py --repo-only" in text
    assert "uv run --project .config/ai-config ty check .config/ai-config/lib .config/ai-config/scripts" in text


def test_readme_commands_use_project_env():
    text = README.read_text(encoding="utf-8")
    assert "uv run --project ~/.config/ai-config python ~/.config/ai-config/scripts/doctor.py" in text
    assert "uv run --project ~/.config/ai-config pytest -q ~/.config/ai-config/tests" in text
