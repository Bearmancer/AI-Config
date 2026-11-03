"""The Cline PreToolUse hook reads Cline's real payload and blocks what it cannot read."""

import json
import shutil
import subprocess
from pathlib import Path

HOOK = Path(__file__).resolve().parents[3] / ".cline" / "hooks" / "PreToolUse.ts"


def run_hook(stdin: str) -> dict | None:
    bun = shutil.which("bun")
    assert bun, "bun is required to run the Cline hook"
    done = subprocess.run([bun, "run", str(HOOK)], input=stdin, capture_output=True, text=True,
                          encoding="utf-8", check=False, timeout=60)
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout) if done.stdout else None


def test_unparseable_payload_is_blocked():
    out = run_hook("not json")
    assert out["cancel"] is True and "not valid JSON" in out["errorMessage"]


def test_payload_with_only_pre_tool_use_is_checked():
    payload = {"preToolUse": {"toolName": "run_commands", "parameters": {"commands": json.dumps(["cmd /c echo hi"])}}}
    out = run_hook(json.dumps(payload))
    assert out["cancel"] is True and "cmd.exe is forbidden" in out["errorMessage"]


def test_tool_call_payload_is_checked_and_allowed_when_clean():
    call = {"name": "run_commands", "input": {"commands": ["cmd /c echo hi"]}}
    assert run_hook(json.dumps({"tool_call": call}))["cancel"] is True
    call["input"] = {"commands": ["./x.ps1"]}
    assert run_hook(json.dumps({"tool_call": call})) is None
