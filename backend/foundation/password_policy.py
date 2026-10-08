"""Password strength enforcement, driven by the platform Security setting's
`passwordPolicy` (basic/medium/strong — see foundation.services.get_platform_setting).
Hooked into the one place every password in this app actually gets set:
UserSerializer.create()/.update() (foundation/serializers.py) — covers an
admin creating a user, an admin changing another user's password, and a
self-service password change alike, since all three funnel through
UserViewSet -> that same serializer (see UserViewSet.perform_update's own
comment on this).
"""

import re

from rest_framework import serializers

from foundation.services import get_platform_setting

_POLICIES = {
    "basic": {
        "min_length": 8,
        "message": "Password must be at least 8 characters.",
    },
    "medium": {
        "min_length": 8,
        "message": "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.",
    },
    "strong": {
        "min_length": 12,
        "message": "Password must be at least 12 characters and include a special character.",
    },
}


def validate_password_policy(password: str, *, using: str | None = None) -> None:
    """`using`: pass the BYPASS alias from unauthenticated flows (Telegram
    password reset), where the default connection has no org context."""
    policy_name = get_platform_setting("security", using=using).get("passwordPolicy", "basic")
    policy = _POLICIES.get(policy_name, _POLICIES["basic"])

    if len(password) < policy["min_length"]:
        raise serializers.ValidationError({"password": policy["message"]})
    if policy_name == "medium" and not (
        re.search(r"[a-z]", password) and re.search(r"[A-Z]", password) and re.search(r"\d", password)
    ):
        raise serializers.ValidationError({"password": policy["message"]})
    if policy_name == "strong" and not re.search(r"[^A-Za-z0-9]", password):
        raise serializers.ValidationError({"password": policy["message"]})


# No 0/O/1/l/I — temporary passwords get read aloud or copied off a screen.
_TEMP_ALPHABET_LOWER = "abcdefghjkmnpqrstuvwxyz"
_TEMP_ALPHABET_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_TEMP_DIGITS = "23456789"


def generate_temporary_password() -> str:
    """13 chars as `xxxxxx-xxxxxx`: passes every policy above (length >= 12,
    upper + lower + digit, `-` as the special character) whatever the
    platform's current setting is."""
    import secrets

    alphabet = _TEMP_ALPHABET_LOWER + _TEMP_ALPHABET_UPPER + _TEMP_DIGITS
    while True:
        chars = [secrets.choice(alphabet) for _ in range(12)]
        if (
            any(c in _TEMP_ALPHABET_LOWER for c in chars)
            and any(c in _TEMP_ALPHABET_UPPER for c in chars)
            and any(c in _TEMP_DIGITS for c in chars)
        ):
            return "".join(chars[:6]) + "-" + "".join(chars[6:])
