import json
import shutil
import subprocess
from pathlib import Path

import pytest

T = Path(__file__).resolve().parent
CASES = json.loads((T / "cases.json").read_text(encoding="utf-8"))
MARK = {"cmd": "cmd.exe is forbidden", "pwsh": "Inline 'powershell'/'pwsh'", "pathlib": "[Policy Violation: python-pathlib-guard]"}


@pytest.fixture(scope="module")
def verdicts():
    bun = shutil.which("bun")
    assert bun
    done = subprocess.run([bun, str(T / "guard_parity.ts"), str(T.parents[2]), str(T / "cases.json")], capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout)


@pytest.mark.parametrize("c", CASES, ids=[c["id"] for c in CASES])
def test_parity(verdicts, c):
    v = verdicts[c["id"]]
    assert v["kilo"] == v["opencode"] == v["cline"]
    if c["expect"] == "allow":
        assert v["opencode"] is None
    else:
        assert MARK[c["expect"]] in v["opencode"]
        if c["expect"] != "pathlib":
            assert v["opencode"].startswith("[Policy Violation: forbidden-terminal-commands]")


def test_cline_stdin():
    hook = str(T.parents[2] / ".cline/hooks/PreToolUse.ts")

    def run(payload):
        d = subprocess.run(["bun", "run", hook], input=payload, capture_output=True, text=True, encoding="utf-8", timeout=60)
        assert d.returncode == 0, d.stderr
        return json.loads(d.stdout) if d.stdout else None

    bad = run("not json")
    assert bad["cancel"] is True and "not valid JSON" in bad["errorMessage"]
    call = json.dumps({"tool_call": {"name": "run_commands", "input": {"commands": ["cmd /c echo hi"]}}})
    assert run(call)["cancel"] is True and "cmd.exe is forbidden" in run(call)["errorMessage"]
    pre = json.dumps({"preToolUse": {"toolName": "run_commands", "parameters": {"commands": json.dumps(["cmd /c echo hi"])}}})
    assert run(pre)["cancel"] is True
    assert run(json.dumps({"tool_call": {"name": "run_commands", "input": {"commands": ["./x.ps1"]}}})) is None
