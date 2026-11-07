"""Environment-file formatting valid for systemd environment.d and POSIX shells."""

import re

_SAFE = re.compile(r"[A-Za-z0-9_@%+=:,./-]*")
_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def format_line(var: str, value: str) -> str:
    """Return one assignment both environment.d and a POSIX shell read the same way."""
    if not _NAME.fullmatch(var):
        raise ValueError(f"invalid environment variable name {var!r}")
    if any(ch in value for ch in "\r\n\0"):
        raise ValueError(f"secret for {var} contains a newline or NUL character")
    if _SAFE.fullmatch(value):
        return f"{var}={value}"
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("$", "\\$")
        .replace("`", "\\`")
    )
    return f'{var}="{escaped}"'
