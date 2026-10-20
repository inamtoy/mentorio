from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK

DEBUG = True
AUTH_COOKIE_SECURE = False
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "common.renderers.EnvelopeJSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]
