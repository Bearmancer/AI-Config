"""Redaction scan over the staged content of the current commit.

Prints `path:line (reason)` for each finding, never the matched text. Exits 1
on any finding. Run by hooks/pre-commit inside the repo's own git context.
"""

import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.redaction import scan_text  # noqa: E402


def git(*args: str) -> bytes:
    return subprocess.run(
        ["git", *args], capture_output=True, check=True, stdin=subprocess.DEVNULL
    ).stdout


def main() -> int:
    names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split(
        b"\0"
    )
    findings = []
    for raw in filter(None, names):
        name = raw.decode("utf-8")
        text = git("show", f":{name}").decode("utf-8", errors="replace")
        findings += scan_text(name, text)
    for finding in findings:
        print(f"secret scan: {finding}", file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
