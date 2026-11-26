"""Doctor smoke: it runs on any home, reports every cell, and never lies OK."""

from pathlib import Path

import doctor
from lib.yaml_config import load_registry

CONFIG_DIR = Path(__file__).resolve().parent.parent


def test_empty_home_reports_every_cell_and_fails(tmp_path):
    registry = load_registry(CONFIG_DIR / "harnesses.yaml")
    cells = doctor.run(tmp_path, registry)
    assert len(cells) == len(doctor.harness_names(registry)) * len(doctor.SURFACES)
    assert doctor.exit_code(cells) == 1
    assert not any(c.state == doctor.UNKNOWN for c in cells)
    by = {(c.harness, c.surface): c.state for c in cells}
    for h in doctor.harness_names(registry):
        # an absent file is never OK; a nothing-to-scan secrets cell may be
        assert by[(h, "instructions")] in (doctor.MISSING, doctor.NA)


def test_render_shows_one_line_per_reason(tmp_path):
    registry = load_registry(CONFIG_DIR / "harnesses.yaml")
    cells = doctor.run(tmp_path, registry)
    lines = doctor.render(cells).splitlines()
    expected = 1 + sum(max(1, len(c.reasons)) for c in cells)
    assert len(lines) == expected
