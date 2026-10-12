# Production image for the Django API. One image runs every backend process
# in deploy/docker-compose.yml (api, migrate, notification worker, cron);
# only the command differs.
FROM python:3.11-slim-bookworm

ARG TARGETARCH
ARG SUPERCRONIC_VERSION=v0.2.49

# pg_dump/psql must match the Postgres 18 server: the Super-Admin backup
# panel and the nightly backup both shell out to pg_dump, which refuses to
# dump a newer server. Debian's own client is older, so install from PGDG.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl postgresql-common \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/*

# supercronic: a cron that keeps the container's environment and logs to
# stdout (plain cron drops env vars, so jobs couldn't reach the database).
RUN case "$TARGETARCH" in \
      arm64) sum=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5 ;; \
      *)     TARGETARCH=amd64; sum=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1 ;; \
    esac \
 && curl -fsSL -o /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}" \
 && echo "${sum}  /usr/local/bin/supercronic" | sha256sum -c - \
 && chmod +x /usr/local/bin/supercronic

COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    BACKUP_DIR=/data/backups

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY . .

RUN useradd --system --uid 1000 --home /app app \
 && mkdir -p /data/backups /data/db-backups \
 && chown -R app:app /data
USER app

EXPOSE 8000
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 120 --access-logfile -"]
