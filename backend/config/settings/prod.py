from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])

CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

# TLS ends at the reverse proxy (deploy/Caddyfile or deploy/nginx-mentorion.conf),
# which talks plain http to gunicorn. Without this, request.is_secure() is
# always False behind it and SECURE_SSL_REDIRECT redirects every request
# forever. Only safe because the backend listens on localhost / an
# unpublished port — the proxy is the only thing that can reach it, and it
# overwrites X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# DJANGO_HTTPS=false exists only for the first minutes of a fresh server,
# before certbot has issued the certificate: with it on, the SSL redirect
# loops and browsers drop the Secure auth cookies over plain http, so login
# can't work. Never leave it off once HTTPS is up.
HTTPS = env.bool("DJANGO_HTTPS", default=True)
SECURE_SSL_REDIRECT = HTTPS
SESSION_COOKIE_SECURE = HTTPS
CSRF_COOKIE_SECURE = HTTPS
AUTH_COOKIE_SECURE = HTTPS
SECURE_HSTS_SECONDS = 31536000 if HTTPS else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = HTTPS
SECURE_HSTS_PRELOAD = HTTPS
SECURE_CONTENT_TYPE_NOSNIFF = True

# Pooling (e.g. PgBouncer) sits in front in production. Only ever use `SET LOCAL`
# (never plain `SET`) so this stays compatible with transaction-mode pooling —
# see common/middleware.py::OrganizationContextMiddleware.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)

# With DEBUG off, Django's default logging sends unhandled request errors
# only to mail_admins (not configured here), so 500 tracebacks vanished.
# Everything goes to stdout instead; the container runtime collects it
# (`docker compose logs backend`).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
