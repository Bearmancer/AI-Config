"""Redaction gate tests, ported from the previous suite.

Ported: tests/test_redaction_fastpath.py (both tests), the scan_text and
find_placeholders cases of test_bws_alone.py and test_mcp_shapes.py, and the
scrub_known case of test_apply.py. The edge-input tests at the end are new.

Fixtures that look like secrets carry a ``~`` inside the token prefix or key
name and ``fx`` removes it at run time, so this file itself passes the
redaction scan that runs over every staged file.
"""

import re

import pytest

from lib import redaction
from lib.redaction import (
    GateError,
    find_placeholders,
    scan_text,
    scrub,
    scrub_known,
)

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


def test_placeholder_scan_ignores_lines_without_marker():
    baseline = find_placeholders("corpus", CORPUS)
    assert find_placeholders("corpus", CORPUS) == baseline
    assert any("malformed" in finding for finding in baseline)
    assert any("placeholder" in finding for finding in baseline)


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
    second = fx("env = { A_TOKEN = \"{{bws:A}}\", API_~KEY = 'abcdEFGH12345' }")
    assert scan_text("mcp.toml", second) == ["mcp.toml:1 (key: API_KEY)"]


def test_name_and_uuid_placeholders_are_both_placeholders():
    assert find_placeholders("f", "k = {{bws:TAVILY}}") == ["f:1 (placeholder)"]
    assert find_placeholders("f", "k = {{bws:}}") == ["f:1 (malformed placeholder)"]
    assert scan_text("f", 'API_KEY = "{{bws:TAVILY}}"') == []


def test_scrub_known_rewrites_fetched_values_to_placeholders():
    other_uuid = "22222222-2222-4222-8222-222222222222"
    text = "first live-value-1 then live-value-1 again, plus live-value-2"
    cleaned = scrub_known(
        text, {TEST_BWS_UUID: "live-value-1", other_uuid: "live-value-2"}
    )
    assert cleaned == (
        "first {{bws:%s}} then {{bws:%s}} again, plus {{bws:%s}}"
        % (TEST_BWS_UUID, TEST_BWS_UUID, other_uuid)
    )


def test_scrub_known_replaces_the_longest_value_first_and_skips_empty():
    cleaned = scrub_known("abc abcdef", {"u1": "abc", "u2": "abcdef", "u3": ""})
    assert cleaned == "{{bws:u1}} {{bws:u2}}"


def test_gate_error_carries_gate_and_findings():
    error = GateError("refused", gate="placeholder-in-link", findings=("a:1",))
    assert str(error) == "refused"
    assert error.gate == "placeholder-in-link"
    assert error.findings == ["a:1"]
    assert GateError("x").gate == "secret"
    assert GateError("x").findings == []


# Edge and malformed inputs (new).


@pytest.mark.parametrize("text", ["", "\n", "   \n\t\n", "{", '"unterminated', "\x00"])
def test_degenerate_input_yields_no_findings_and_does_not_raise(text):
    assert scan_text("f", text) == []
    assert find_placeholders("f", text) == []
    assert scrub(text) == text


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


def test_malformed_placeholder_variants_are_reported():
    assert find_placeholders("f", "k = {{bws:") == ["f:1 (malformed placeholder)"]
    assert find_placeholders("f", "k = {{bws:a b}}") == [
        "f:1 (malformed placeholder)"
    ]
    assert find_placeholders("f", "no marker here {{other}}") == []


def test_scrub_masks_tokens_and_urls_but_keeps_plain_text():
    cleaned = scrub(fx("see https://example.com/x?y=1 and gh~p_abcdefghijklmnopqrstuvwx ok"))
    assert cleaned == "see [redacted] and [redacted] ok"
    assert scrub("nothing sensitive") == "nothing sensitive"
