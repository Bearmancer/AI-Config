"""JSON and JSONC parsing with duplicate-key detection at every level."""

import json


class JsonError(Exception):
    """The text is not valid for the requested dialect."""


def _blank_comments(text: str) -> str:
    """Replace comments and trailing commas with spaces, keeping offsets and lines."""
    out = list(text)
    n = len(text)
    i = 0
    last_comma = -1  # index of a comma not yet followed by a value or closer
    while i < n:
        ch = text[i]
        if ch == '"':
            i += 1
            while i < n and text[i] != '"':
                i += 2 if text[i] == "\\" else 1
            i += 1
            last_comma = -1
        elif ch == "/" and text[i + 1 : i + 2] == "/":
            while i < n and text[i] != "\n":
                out[i] = " "
                i += 1
        elif ch == "/" and text[i + 1 : i + 2] == "*":
            end = text.find("*/", i + 2)
            end = n if end == -1 else end + 2
            for k in range(i, end):
                if text[k] != "\n":
                    out[k] = " "
            i = end
        elif ch == ",":
            last_comma = i
            i += 1
        elif ch in "]}":
            if last_comma != -1:
                out[last_comma] = " "
            last_comma = -1
            i += 1
        else:
            if not ch.isspace():
                last_comma = -1
            i += 1
    return "".join(out)


def _no_duplicates(pairs: list[tuple[str, object]]) -> dict:
    seen: set[str] = set()
    for key, _ in pairs:
        if key in seen:
            raise JsonError(f"duplicate key {key!r}")
        seen.add(key)
    return dict(pairs)


def parse(text: str, *, strict: bool, check_duplicates: bool = True) -> object:
    """Parse JSON (strict) or JSONC (comments and trailing commas allowed).

    Raises JsonError on a syntax error or, when check_duplicates is set, on a
    key repeated within any one object at any depth.
    """
    text = text.removeprefix("\ufeff")
    source = text if strict else _blank_comments(text)
    try:
        return json.loads(
            source, object_pairs_hook=_no_duplicates if check_duplicates else None
        )
    except json.JSONDecodeError as exc:
        raise JsonError(f"line {exc.lineno} col {exc.colno}: {exc.msg}") from None
