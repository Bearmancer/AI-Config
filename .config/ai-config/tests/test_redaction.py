"""Redaction gate tests: token shapes, key shapes, references, and the 2026-11 gaps.

Fixtures that look like secrets carry a ``~`` inside the token prefix or key
name and ``fx`` removes it at run time, so this file itself passes the
redaction scan that runs over every staged file.
"""

import re

import pytest

from lib import redaction
from lib.redaction import scan_text

TEST_BWS_UUID = "11111111-1111-4111-8111-111111111111"


def fx(text):
    return text.replace("~", "")


CORPUS = fx(
    "\n".join(
        [
            "plain prose with no assignment and no quoted key",
            "s~k-abcdefghijklmnopqrstuvwx",
            "s~k_live_abcdefghijklmnop",
            "tv~ly-abcdefghijklmnop",
            "f~c-abcdefghijklmnopqrstuvwx",
            "AI~zaabcdefghijklmnopqrstuvwxyz12345",
            "gh~p_abcdefghijklmnopqrstuvwx",
            "github~_pat_abcdefghijklmnopqrstuvwx",
            "gl~pat-abcdefghijklmnopqrst",
            "AK~IAABCDEFGHIJKLMNOP",
            "h~f_abcdefghijklmnopqrstuvwxyz1234",
            "n~pm_abcdefghijklmnopqrstuvwxyz1234",
            "xo~xb-abcdefghijkl",
            "ey~Jhbgciojihuzi1nij9.ey~Jzdwiioixmjm0nty3odkwin0.abcdefghijklmnop",
            "-----BEGIN RSA PRIV~ATE KEY-----",
            'Authoriz~ation: "Bear~er abcdefghijklmnop"',
            '{"EXA_~API_KEY": "abcdefghijklmnop"}',
            "export API_TO~KEN=abcdefghijklmnop",
            "service:\n  sec~ret: abcdefghijklmnop",
            'API_~KEY = "abcdefghijklmnop"',
            f"service:\n  secret: {{{{bws:{TEST_BWS_UUID}}}}}",
            "service:\n  secret: {{bws:not valid}}",
        ]
    )
)


def test_trigger_prefilter_never_changes_findings(monkeypatch):
    baseline = scan_text("corpus", CORPUS)
    monkeypatch.setattr(redaction, "_TRIGGER_RE", re.compile(r""))
    assert scan_text("corpus", CORPUS) == baseline
    assert baseline


def test_every_token_shape_in_the_corpus_is_found():
    entries = CORPUS.split("\n")
    secret_entries = [
        e
        for e in entries
        if e.strip() and not e.startswith(("plain", "service:", "  secret: {{"))
    ]
    assert len(secret_entries) >= 19
    for entry in secret_entries:
        assert scan_text("corpus", entry), entry
    assert scan_text("corpus", entries[0]) == []


def test_secret_gate_passes_references_and_flags_literals():
    literal = fx('env = { EXA_API~_KEY = "a1b2c3d4e5f6g7h8i9j0k1l2" }')
    assert scan_text("mcp.toml", literal) == ["mcp.toml:1 (key: EXA_API_KEY)"]
    assert scan_text("mcp.toml", 'env = { EXA_API_KEY = "{{bws:EXA}}" }') == []
    second = fx('env = { A_TOKEN = "{{bws:A}}", API_~KEY = \'abcdEFGH12345\' }')
    assert scan_text("mcp.toml", second) == ["mcp.toml:1 (key: API_KEY)"]


def test_scan_passes_reference_placeholder():
    assert scan_text("f", 'API_KEY = "{{bws:TAVILY}}"') == []


def test_bearer_with_tab_is_caught():
    assert scan_text("f", 'Authorization: "Bearer\tabcdefghijklmnop"') == [
        "f:1 (token-shape)"
    ]


def test_url_with_userinfo_is_caught():
    assert scan_text("f", "API_KEY=https://user:tok@host/path") == [
        "f:1 (key: API_KEY)"
    ]


def test_plain_url_without_userinfo_passes():
    assert scan_text("f", "API_KEY=https://example.com/some/long/path") == []


def test_short_key_value_is_caught():
    assert scan_text("f", fx('API_~KEY="abcd~efgh"')) == ["f:1 (key: API_KEY)"]


def test_key_value_under_eight_chars_passes():
    assert scan_text("f", 'API_KEY="abcdefg"') == []


# Edge and malformed inputs.


@pytest.mark.parametrize("text", ["", "\n", "   \n\t\n", "{", '"unterminated', "\x00"])
def test_degenerate_input_yields_no_findings_and_does_not_raise(text):
    assert scan_text("f", text) == []


def test_findings_name_the_line_and_never_contain_the_value():
    value = "abcdefghijklmnopqrstuvwx"
    findings = scan_text("f.env", f"# header\nexport API_TOKEN={value}\n")
    assert findings == ["f.env:2 (key: API_TOKEN)"]
    findings = scan_text("f", f"x\nsk-{value}\n")
    assert findings == ["f:2 (token-shape)"]
    assert all(value not in finding for finding in findings)


def test_crlf_line_endings_report_the_same_lines():
    assert scan_text("f", "a\r\nexport API_TOKEN=abcdefghijklmnop\r\n") == [
        "f:2 (key: API_TOKEN)"
    ]


@pytest.mark.parametrize(
    "line",
    [
        '"apiKey": "{env:EXA_API_KEY}"',
        '"apiKey": "${EXA_API_KEY}"',
        '"apiKey": "${env:EXA_API_KEY}"',
        '"apiKey": "{file:~/.secrets/exa}"',
        "API_KEY=https://example.com/some/long/path",
        '"ZOTERO_LIBRARY_ID": "22374787"',
    ],
)
def test_references_and_non_secret_values_pass(line):
    assert scan_text("f", line) == []
