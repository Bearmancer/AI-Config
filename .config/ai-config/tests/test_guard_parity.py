"""The Kilo plugins and the Cline hook give the same verdict and message as the OpenCode plugins."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

TESTS = Path(__file__).resolve().parent
ROOT = TESTS.parents[2]
CASES = json.loads((TESTS / "guard_parity_cases.json").read_text(encoding="utf-8"))
MARKERS = {
    "cmd": "cmd.exe is forbidden",
    "pwsh": "Inline 'powershell'/'pwsh'",
    "pathlib": "[Policy Violation: python-pathlib-guard]",
}


@pytest.fixture(scope="module")
def verdicts():
    bun = shutil.which("bun")
    assert bun, "bun is required to run the guard parity script"
    done = subprocess.run(
        [
            bun,
            str(TESTS / "guard_parity.ts"),
            str(ROOT),
            str(TESTS / "guard_parity_cases.json"),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        timeout=120,
    )
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_same_verdict_as_opencode(verdicts, case):
    got = verdicts[case["id"]]
    assert got["kilo"] == got["opencode"]
    assert got["cline"] == got["opencode"]
    if case["expect"] == "allow":
        assert got["opencode"] is None
    else:
        assert MARKERS[case["expect"]] in got["opencode"]
        if case["expect"] != "pathlib":
            assert got["opencode"].startswith(
                "[Policy Violation: forbidden-terminal-commands]"
            )
