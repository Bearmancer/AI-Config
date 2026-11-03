"""Doctor tests: a clean fake home is all OK; each break lands in the right cell.

The fake home is a real folder with `git init`, the real .gitignore allowlist
and the real harnesses.toml, so the tracked-set check runs for real. Secret
fixtures carry a ``~`` and ``fx`` removes it at run time, so this file passes
the redaction scan.
"""

import json
import shutil
import subprocess
import tomllib
from pathlib import Path

import pytest

from lib import jsonc
from scripts import doctor

CONFIG_DIR = Path(doctor.__file__).resolve().parent.parent
REAL_GITIGNORE = CONFIG_DIR.parents[1] / ".gitignore"
NAMES = ("agentql", "arxiv", "codegraph", "dappier", "exa", "firecrawl",
         "paper-search", "scrapegraph", "tavily", "zotero")
KEYS = {"agentql": "AGENTQL_API_KEY", "dappier": "DAPPIER_API_KEY", "exa": "EXA_API_KEY",
        "firecrawl": "FIRECRAWL_API_KEY", "scrapegraph": "SGAI_API_KEY",
        "tavily": "TAVILY_API_KEY", "zotero": "ZOTERO_API_KEY"}
ENV = {key: "set" for key in KEYS.values()}


def fx(text):
    return text.replace("~", "")


def stanza(h, reg, name):
    shape = doctor.SHAPES[h]
    argv = ["serve", "--mcp"] if name == "codegraph" else []
    s = {"type": shape["type"]} if shape["type"] else {}
    if shape["cmd"] == "list":
        s["command"] = [name, *argv]
    else:
        s["command"], s["args"] = name, argv
    if name in KEYS:
        ref = reg[h]["mcp"]["env_ref"].replace("VAR", KEYS[name])
        s[shape["env"]] = {KEYS[name]: ref}
        if name == "zotero":
            s[shape["env"]]["ZOTERO_LIBRARY_ID"] = "123"
    if shape["off"] and name != "codegraph":
        s[shape["off"][0]] = shape["off"][1]
    return s


def write(home, rel, text):
    path = home / rel.removeprefix("~/")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def build_mcp(home, reg, h):
    names = ("codegraph",) if h == "claude" else NAMES
    at = (reg[h]["mcp"].get("servers_at") or doctor.SERVERS_AT.get(h, "")).split(".")
    doc = {n: stanza(h, reg, n) for n in names}
    for part in reversed(at):
        doc = {part: doc}
    if h in ("opencode", "kilo"):
        doc["instructions"] = ["~/.agents/AGENTS.md"]
    write(home, reg[h]["mcp"]["path"], json.dumps(doc, indent=1))


@pytest.fixture
def world(tmp_path):
    reg = tomllib.loads((CONFIG_DIR / "harnesses.toml").read_text(encoding="utf-8"))
    home = tmp_path / "home"
    home.mkdir()
    subprocess.run(["git", "init", "-q", str(home)], check=True)
    shutil.copy(REAL_GITIGNORE, home / ".gitignore")
    write(home, ".agents/AGENTS.md", "rules\n")
    write(home, ".claude/CLAUDE.md", "@~/.agents/AGENTS.md\n")
    write(home, "skills-lock.json", json.dumps({"version": 1, "skills": {"alpha": {}}}))
    write(home, ".agents/skills/alpha/SKILL.md", "# alpha\n")
    write(home, ".claude/skills/alpha/SKILL.md", "# alpha\n")
    write(home, ".claude/skills/synced/other/SKILL.md", "# claude.ai\n")
    for h in doctor.HARNESSES:
        build_mcp(home, reg, h)
        for spec in reg[h]["files"]:
            if not spec.get("optional") and not (home / spec["path"].removeprefix("~/")).exists():
                write(home, spec["path"], "{}")
    return home, reg


def states(home, reg, env=ENV, repo_only=False):
    cells = doctor.run(home, reg, env, repo_only)
    return {(c.harness, c.surface): c for c in cells}, cells


def test_clean_home_is_25_cells_all_ok_or_na(world):
    home, reg = world
    by, cells = states(home, reg)
    assert len(cells) == 25
    assert {c.state for c in cells} <= {doctor.OK, doctor.NA}
    assert by["omo", "instructions"].state == doctor.NA
    assert by["omo", "instructions"].reasons == [reg["omo"]["instructions"]["na"]]
    assert doctor.main(["--home", str(home)], env=ENV) == 0


def test_absent_mcp_file_is_missing_never_ok(world):
    home, reg = world
    (home / ".omo/agent/mcp.json").unlink()
    by, cells = states(home, reg)
    assert by["omo", "mcp"].state == doctor.MISSING
    assert by["omo", "secrets"].state == doctor.MISSING
    assert doctor.exit_code(cells) == 1


def test_literal_secret_in_a_stanza_is_drift(world):
    home, reg = world
    path = home / ".config/kilo/kilo.jsonc"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["mcp"]["servers"]["exa"]["environment"]["EXA_API_KEY"] = fx("s~k-abcdefghijklmnopqrstuvwx")
    path.write_text(json.dumps(doc, indent=1), encoding="utf-8")
    by, cells = states(home, reg)
    assert by["kilo", "secrets"].state == doctor.DRIFT
    assert by["kilo", "mcp"].state == doctor.DRIFT
    assert fx("s~k-abcdefghij") not in " ".join(r for c in cells for r in c.reasons)


def test_second_enabled_server_is_drift(world):
    home, reg = world
    path = home / ".config/opencode/opencode.jsonc"
    doc = json.loads(path.read_text(encoding="utf-8"))
    del doc["mcp"]["servers"]["exa"]["disabled"]
    path.write_text(json.dumps(doc, indent=1), encoding="utf-8")
    by, cells = states(home, reg)
    assert by["opencode", "mcp"].state == doctor.DRIFT
    assert "exa" in by["opencode", "mcp"].reasons[0]
    assert doctor.exit_code(cells) == 1


def test_comment_in_a_json_only_file_is_drift(world):
    home, reg = world
    write(home, ".config/opencode/cli.json", '{\n  // note\n  "a": 1\n}\n')
    by, _ = states(home, reg)
    assert by["opencode", "config"].state == doctor.DRIFT


def test_duplicate_key_at_any_level_is_drift(world):
    home, reg = world
    write(home, ".omo/omo.jsonc", '{"a": {"b": 1, // c\n "b": 2,},}')
    by, _ = states(home, reg)
    assert by["omo", "config"].state == doctor.DRIFT
    assert "duplicate key 'b'" in by["omo", "config"].reasons[0]


def test_unset_env_reference_is_missing(world):
    home, reg = world
    env = {k: v for k, v in ENV.items() if k != "EXA_API_KEY"}
    by, _ = states(home, reg, env)
    assert by["opencode", "secrets"].state == doctor.MISSING
    assert "EXA_API_KEY" in by["opencode", "secrets"].reasons[0]


def test_lock_skill_absent_from_a_skills_dir_is_drift_and_twins_too(world):
    home, reg = world
    write(home, "skills-lock.json", json.dumps({"skills": {"alpha": {}, "beta": {}}}))
    write(home, ".agents/skills/beta/SKILL.md", "# beta\n")
    write(home, ".config/opencode/skills/alpha/SKILL.md", "# copy\n")
    by, _ = states(home, reg)
    assert by["omo", "skills"].state == doctor.OK
    assert by["claude", "skills"].state == doctor.DRIFT
    assert "beta" in by["claude", "skills"].reasons[0]
    assert any("twin copies" in r for r in by["opencode", "skills"].reasons)


def test_skill_dir_not_in_lock_is_stale_drift_but_synced_is_not(world):
    home, reg = world
    write(home, ".agents/skills/gone/SKILL.md", "# gone\n")
    write(home, ".claude/skills/gone/SKILL.md", "# gone\n")
    write(home, ".config/kilo/skills/old/SKILL.md", "# old\n")
    by, cells = states(home, reg)
    for h in ("omo", "opencode", "claude"):
        assert "stale skill not in lock: gone; purge it" in by[h, "skills"].reasons
    assert any("stale skill not in lock: ~/.config/kilo/skills/old" in r for r in by["kilo", "skills"].reasons)
    assert not any("synced" in r for c in cells for r in c.reasons)
    assert doctor.exit_code(cells) == 1


def test_claude_skills_dir_absent_is_missing_and_synced_is_ignored(world):
    home, reg = world
    by, _ = states(home, reg)
    assert by["claude", "skills"].state == doctor.OK
    shutil.rmtree(home / ".claude/skills")
    by, _ = states(home, reg)
    assert by["claude", "skills"].state == doctor.MISSING


def test_tracked_set_disagreement_is_drift_everywhere(world):
    home, reg = world
    with (home / ".gitignore").open("a", encoding="utf-8") as f:
        f.write("\n!/stray.jsonc\n")
    write(home, "stray.jsonc", "{}")
    by, cells = states(home, reg)
    assert all(by[h, "config"].state == doctor.DRIFT for h in doctor.HARNESSES)
    assert doctor.exit_code(cells) == 1


def test_failed_check_is_unknown_not_ok(world, monkeypatch):
    def boom(ctx, h):
        raise OSError("disk")

    monkeypatch.setattr(doctor, "check_skills", boom)
    by, cells = states(*world)
    assert by["omo", "skills"].state == doctor.UNKNOWN
    assert doctor.exit_code(cells) == 1


def test_repo_only_needs_no_live_files(world):
    home, reg = world
    (home / ".cline/data/settings/cline_mcp_settings.json").unlink()
    shutil.rmtree(home / ".agents/skills")
    by, cells = states(home, reg, None, repo_only=True)
    assert by["cline", "mcp"].state == doctor.NA
    assert doctor.exit_code(cells) == 0


def test_json_output_lists_25_cells(world, capsys):
    home, _ = world
    assert doctor.main(["--json", "--home", str(home)], env=ENV) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["exit"] == 0 and len(report["cells"]) == 25


def test_jsonc_dialects():
    assert jsonc.parse('{"u": "http://x", // c\n "a": [1,],}', strict=False) == {"u": "http://x", "a": [1]}
    with pytest.raises(jsonc.JsonError):
        jsonc.parse('{"a": 1, // c\n}', strict=True)
    with pytest.raises(jsonc.JsonError, match="duplicate key 'k'"):
        jsonc.parse('[{"k": 1, "k": 2}]', strict=True)
