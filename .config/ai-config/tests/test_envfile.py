"""environment.d formatting: safe bare values, quoted escapes, systemd round-trip."""

import re

import pytest

from lib.envfile import format_line


def test_safe_value_is_bare():
    assert format_line("DEMO", "abc_123:/.-@%+=,") == "DEMO=abc_123:/.-@%+=,"


def test_spaces_are_double_quoted():
    assert format_line("DEMO", "a b") == 'DEMO="a b"'


def test_dollar_and_backtick_are_escaped():
    assert format_line("DEMO", "$x`y") == 'DEMO="\\$x\\`y"'


def test_single_quote_needs_no_escape_inside_double_quotes():
    assert format_line("DEMO", "a'b") == 'DEMO="a\'b"'


def test_backslash_and_quote_are_escaped():
    assert format_line("DEMO", 'a\\"b') == 'DEMO="a\\\\\\"b"'


def test_newline_is_rejected():
    with pytest.raises(ValueError, match="newline"):
        format_line("DEMO", "a\nb")


def test_bad_name_is_rejected():
    with pytest.raises(ValueError, match="variable name"):
        format_line("1KEY", "x")


def test_round_trip_through_a_systemd_style_parser():
    value = 'p@ss "word" $x `y` \\'
    line = format_line("DEMO", value)
    raw = line.split("=", 1)[1]
    assert raw.startswith('"') and raw.endswith('"')
    assert re.sub(r"\\(.)", r"\1", raw[1:-1]) == value
