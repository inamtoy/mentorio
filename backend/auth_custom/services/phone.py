"""Phone matching for identity checks. `User.phone` is free text
("+998 90 123-45-67", "901234567", ...) while Telegram reports contacts as
bare digits ("998901234567"), so raw string equality is useless.
"""

from __future__ import annotations

import re

# Uzbek subscriber numbers are 9 digits after the 998 country code; the same
# tail comparison tolerates a missing/extra country code or trunk prefix.
# Ten-digit national numbers (e.g. Kazakhstan's +7) still need 9 matching
# trailing digits, which keeps the false-match odds negligible.
_SIGNIFICANT_DIGITS = 9


def digits_only(raw: str | None) -> str:
    return re.sub(r"\D", "", raw or "")


def phones_match(a: str | None, b: str | None) -> bool:
    da, db = digits_only(a), digits_only(b)
    if len(da) < _SIGNIFICANT_DIGITS or len(db) < _SIGNIFICANT_DIGITS:
        return False
    return da[-_SIGNIFICANT_DIGITS:] == db[-_SIGNIFICANT_DIGITS:]
