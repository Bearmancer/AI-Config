# Doctor prints one row per harness per surface and never writes

Context: The registry decides how many harnesses exist and each harness carries up to five surfaces, so the cell count grows with `harnesses.toml`. Any cell can fall out of line without a sign, and an older check once reported green for a file that did not exist.

Decision: `scripts/doctor.py` is read-only. It prints one row per cell with a state and a reason, then a count line, and exits 0 only when every cell is OK or NA.

- OK: the file is present and correct.
- DRIFT: present but wrong, for example a second enabled server, a twin copy or a flag in the wrong dialect.
- MISSING: absent. A missing file is never OK, and a missing app-owned file is MISSING too.
- NA: the harness cannot take the surface, with a reason read from the harness's own source and recorded in `harnesses.toml`. Today omo's instructions cell is NA, because senpi loads a global instruction file only from `~/.omo/agent/` and has no setting for another path.
- UNKNOWN: the check itself failed.

`--json` prints the same cells as data. `--repo-only` marks the cells that need a PC's untracked, app-owned files as NA, so a bare checkout (CI) can run it. A drifting cell makes the exit code 1, and the pre-commit hook refuses the commit (see [0001](0001-repo-is-master.md)).

Cells compare what the registry says each file must hold, not everything an app also writes. Doctor never prints a secret value, only variable names, file names and line numbers.

Alternatives rejected: a flat list of findings (gaps are easy to miss in it); a doctor that fixes what it finds (a command that writes breaks the read-only promise and hides the cause); comparing the Magic Context database (it is data and reads as changed forever).

## Consequences

- A failing cell is visible at the moment of the commit, not weeks later.
- An NA cell needs a reason, so "does not apply" cannot hide "was forgotten".
- A new surface or harness is a new row of cells and a test for each.
