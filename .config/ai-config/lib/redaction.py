"""Redaction: secret-shape scanning on one pattern set."""

import re


VALUE_PATTERNS = (
    r"sk-[A-Za-z0-9_-]{20,}",
    r"sk_live_[A-Za-z0-9]{16,}",
    r"tvly-[A-Za-z0-9_-]{16,}",
    r"fc-[A-Za-z0-9]{24,}",
    r"AIza[0-9A-Za-z_-]{30,}",
    r"gh[pousr]_[A-Za-z0-9]{20,}",
    r"github_pat_[A-Za-z0-9_]{20,}",
    r"glpat-[A-Za-z0-9_-]{20,}",
    r"(?:AKIA|ASIA)[0-9A-Z]{16}",
    r"(?:hf|npm)_[A-Za-z0-9]{30,}",
    r"xox[baprs]-[A-Za-z0-9-]{10,}",
    r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"Bearer\s+[A-Za-z0-9._-]{16,}",
)
_VALUE_ANY_RE = re.compile("|".join(f"(?:{pattern})" for pattern in VALUE_PATTERNS))
_KEY_NAME = (
    r"[A-Za-z0-9_]*(?:API_?KEY|API_?TOKEN|TOKEN|SECRET|PASSWORD|"
    r"CLIENT_?ID|CLIENT_?SECRET|ACCESS_?KEY|PRIVATE_?KEY|AUTHORIZATION)[A-Za-z0-9_]*"
)
_KEY_RE = re.compile(
    rf'"(?P<key>{_KEY_NAME})"\s*:\s*"(?P<val>[^"]{{8,}})"', re.IGNORECASE
)
_SHELL_RE = re.compile(
    rf"^\s*(?:export\s+)?(?P<key>{_KEY_NAME})\s*=\s*(?P<val>.+?)\s*$", re.IGNORECASE
)
_YAML_RE = re.compile(
    rf"^\s*(?:-\s+)?(?P<key>[A-Za-z0-9_.\-]*{_KEY_NAME}[A-Za-z0-9_.\-]*)\s*:\s+(?P<val>.+?)\s*$",
    re.IGNORECASE,
)
_TOML_PAIR_RE = re.compile(
    rf"(?P<key>{_KEY_NAME})\s*=\s*[\"'](?P<val>[^\"']+)[\"']", re.IGNORECASE
)
_NONSECRET_RE = re.compile(
    r"^(?:true|false|\d{1,12}|https?://|/|[A-Z]:\\|\./|(?:[A-Za-z0-9_.@-]+/)+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-)"
)
_REFONLY_RE = re.compile(r"\{env:|\$\{|\{file:")
_URL_USERINFO_RE = re.compile(r"^https?://[^/\s@]+:[^/\s@]+@")
PLACEHOLDER_RE = re.compile(r"\{\{bws:([A-Za-z0-9_.\-]+)\}\}")
# Strict superset of every trigger below: a line with none of these cannot
# match a token shape, or a key whose name marks it as a credential.
_TRIGGER_RE = re.compile(
    r"sk[-_]|tvly-|fc-|AIza|gh[pousr]_|github_pat_|glpat-|"
    r"(?:AKIA|ASIA)|(?:hf|npm)_|xox[baprs]-|eyJ|-----BEGIN |Bearer\s+"
    r"|API_?KEY|API_?TOKEN|TOKEN|SECRET|PASSWORD|"
    r"CLIENT_?ID|CLIENT_?SECRET|ACCESS_?KEY|PRIVATE_?KEY|AUTHORIZATION",
    re.IGNORECASE,
)


def _is_non_secret(value: str) -> bool:
    candidate = value.strip().strip("\"'")
    if _URL_USERINFO_RE.match(candidate):
        return False
    return bool(_NONSECRET_RE.match(candidate))


def _suspicious_value(value: str) -> bool:
    candidate = value.strip().strip("\"'")
    return (
        len(candidate) >= 8
        and "(" not in candidate
        and ")" not in candidate
        and not (_REFONLY_RE.search(candidate) or _is_non_secret(candidate))
    )


def scan_text(display: str, text: str) -> list[str]:
    findings: list[str] = []
    for number, raw_line in enumerate(text.splitlines(), start=1):
        if _TRIGGER_RE.search(raw_line) is None:
            continue
        line = PLACEHOLDER_RE.sub("", raw_line) if "{{bws:" in raw_line else raw_line
        if _VALUE_ANY_RE.search(line):
            findings.append(f"{display}:{number} (token-shape)")
            continue
        if hit := next(
            (
                m
                for m in _KEY_RE.finditer(line)
                if not (
                    _REFONLY_RE.search(v := m.group("val")) or _is_non_secret(v)
                )
            ),
            None,
        ):
            findings.append(f"{display}:{number} (key: {hit.group('key')})")
            continue
        matches = [m for p in (_SHELL_RE, _YAML_RE) if (m := p.search(line))] + list(
            _TOML_PAIR_RE.finditer(line)
        )
        if hit := next((m for m in matches if _suspicious_value(m.group("val"))), None):
            findings.append(f"{display}:{number} (key: {hit.group('key')})")
    return findings
