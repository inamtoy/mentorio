#!/usr/bin/env bash
# Updates Mentorio on the server. Run as the deploy user:
#   ~/mentorion/deploy/deploy.sh            # pull main, rebuild, restart
#   ~/mentorion/deploy/deploy.sh --no-pull  # rebuild what is checked out
# Order: pull → backend deps → migrate → frontend build → restart → health check.
# Any failing step stops the script before the running services are touched.
set -euo pipefail

APP=mentorion
APP_DIR=/home/deploy/$APP
BRANCH=${DEPLOY_BRANCH:-main}
export PATH=$HOME/.local/bin:$PATH

log() { printf '\n==> %s\n' "$*"; }
cd "$APP_DIR"

if [[ ${1:-} != --no-pull ]]; then
    log "git pull ($BRANCH)"
    # npm install rewrites the Windows-generated lockfile; drop that so the pull fast-forwards.
    git checkout -- frontend/package-lock.json
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull --ff-only origin "$BRANCH"
fi
git log -1 --format='commit %h  %s'

log "Backend dependencies"
cd "$APP_DIR/backend"
UV_PROJECT_ENVIRONMENT=.venv uv sync --locked --no-dev

log "Migrations (as the schema owner role)"
set -a
. ./.env
set +a
export DJANGO_SETTINGS_MODULE=config.settings.prod
DB_USER=$DB_OWNER_USER DB_PASSWORD=$DB_OWNER_PASSWORD .venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py check --deploy --fail-level ERROR

log "Frontend build"
cd "$APP_DIR/frontend"
npm install --no-audit --no-fund
NEXT_TELEMETRY_DISABLED=1 npm run build
# The standalone server doesn't bundle these two (nginx serves _next/static
# directly too, from .next/static).
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
git checkout -- package-lock.json

log "Restart"
sudo systemctl restart $APP.service $APP-worker.service $APP-frontend.service

log "Health check"
for i in $(seq 1 30); do
    api=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: mentorio.uz' -H 'X-Forwarded-Proto: https' http://127.0.0.1:8001/api/v1/auth/login/ || true)
    web=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/login || true)
    if [[ $api =~ ^[2-4] && $web == 200 ]]; then
        log "OK (api $api, web $web)"
        exit 0
    fi
    sleep 1
done
echo "Health check failed (api $api, web $web). Logs: journalctl -u $APP -u $APP-frontend -n 100" >&2
exit 1
