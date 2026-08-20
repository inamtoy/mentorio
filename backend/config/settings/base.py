"""
Base Django settings for Mentorio, shared by dev/prod/test.
"""

import base64
import hashlib
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-dev-key-change-me")


def _default_payment_gateway_encryption_key() -> str:
    """Deliberately NOT a fixed literal — a hardcoded Fernet key committed to
    the repo would mean anyone who can read this source (a leaked clone, a
    former contributor, a public fork) can decrypt every deployment's
    Payme/Click merchant `secret_key` and forge valid webhook signatures,
    fraudulently marking invoices paid (flagged in security review 2026-08-08).
    Derived per-deployment from SECRET_KEY instead, via a fixed, unrelated
    salt string (so it's a distinct key, not SECRET_KEY reused) — safe to
    leave unset for local dev/tests (each clone's SECRET_KEY differs), and
    an unset SECRET_KEY in production is already a much bigger, pre-existing
    problem than this derived default makes it. A real deployment should
    still set PAYMENT_GATEWAY_ENCRYPTION_KEY explicitly — see .env.example —
    so it can be rotated independently of SECRET_KEY.
    """
    digest = hashlib.sha256(f"payment-gateway-encryption-key:{SECRET_KEY}".encode()).digest()
    return base64.urlsafe_b64encode(digest).decode()


# Fernet key (common/fields.py::EncryptedTextField) protecting Payme/Click
# merchant secret_keys at rest.
PAYMENT_GATEWAY_ENCRYPTION_KEY = env(
    "PAYMENT_GATEWAY_ENCRYPTION_KEY", default=_default_payment_gateway_encryption_key()
)

INSTALLED_APPS = [
    # django.contrib.auth is required even though we don't use its User model
    # or admin — simplejwt and DRF both import django.contrib.auth.models at
    # load time. Its own Permission/Group tables end up empty/unused; that's
    # expected, not a sign anything is misconfigured.
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",
    "common",
    "foundation",
    "auth_custom",
    "student",
    "teacher",
    "course",
    "groups",
    "attendance",
    "finance",
    "notifications",
    "schedule",
    "homework",
    "payment_gateways",
    "billing",
    "exams",
    "grades",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "common.middleware.OrganizationContextMiddleware",
]

CORS_ALLOWED_ORIGINS: list[str] = []  # overridden per-environment
CORS_ALLOW_CREDENTIALS = True  # frontend sends/receives the httpOnly auth cookies cross-port

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", default="educore"),
        "USER": env("DB_USER", default="educore_app"),
        "PASSWORD": env("DB_PASSWORD", default=""),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
        "ATOMIC_REQUESTS": False,  # OrganizationContextMiddleware manages its own atomic() block
    }
}

# A second connection alias, using a role with BYPASSRLS, for the login lookup
# path only (resolving login_id -> user happens before any org context exists).
# Same physical database as `default`, just a different role — TEST.MIRROR
# stops Django's test runner from provisioning (and migrating) a whole
# separate physical test database for it.
DATABASES["auth_bypass_rls"] = {
    **DATABASES["default"],
    "USER": env("DB_AUTH_BYPASS_USER", default="educore_auth_bypass"),
    "PASSWORD": env("DB_AUTH_BYPASS_PASSWORD", default=""),
    "TEST": {"MIRROR": "default"},
}

AUTH_USER_MODEL = "foundation.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "common.authentication.SessionValidatingJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "common.renderers.EnvelopeJSONRenderer",
    ],
    "EXCEPTION_HANDLER": "common.exceptions.envelope_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "common.pagination.EnvelopePageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,  # persistence handled by auth_custom, not simplejwt's blacklist app
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    # No TOKEN_OBTAIN_SERIALIZER: login goes through auth_custom's own
    # LoginView (not simplejwt's TokenObtainPairView), since login_id-based
    # auth + the BYPASSRLS lookup path don't fit simplejwt's default flow —
    # see auth_custom/services/token_service.py::issue_tokens.
}

# Max simultaneously-active refresh tokens per user (DDL comment, enforced in token_service.py)
AUTH_MAX_ACTIVE_REFRESH_TOKENS = 5
