from __future__ import annotations

from dataclasses import dataclass

from ._generated_errors import GENERATED_ERROR_CATALOG


@dataclass(frozen=True)
class _ErrorEntry:
    code: str
    retryable: bool
    fatal: bool


_CATALOG: list[_ErrorEntry] = [
    _ErrorEntry(entry.code, retryable=entry.retryable, fatal=entry.fatal)
    for entry in GENERATED_ERROR_CATALOG
]

_CATALOG_MAP: dict[str, _ErrorEntry] = {e.code: e for e in _CATALOG}


class CortexError(Exception):
    """SDK error with canonical code, retryable, and fatal flags."""

    def __init__(self, code: str, message: str, retryable: bool, fatal: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.fatal = fatal

    def __repr__(self) -> str:
        return (
            f"CortexError(code={self.code!r}, message={str(self)!r}, "
            f"retryable={self.retryable}, fatal={self.fatal})"
        )


def make_error(code: str, message: str) -> CortexError:
    """Build a CortexError, filling retryable/fatal from the catalog."""
    entry = _CATALOG_MAP.get(code)
    if entry is not None:
        return CortexError(entry.code, message, entry.retryable, entry.fatal)
    # Unknown code — conservative defaults
    return CortexError(code, message, retryable=False, fatal=False)


def lookup_error(code: str) -> _ErrorEntry | None:
    return _CATALOG_MAP.get(code)
