# Deploying Mentorio

One server, one domain, Docker Compose. Everything below runs from this
`deploy/` directory.

```
internet ──443──▶ caddy ──/api/*──▶ backend (gunicorn, Django)
                     └──── else ──▶ frontend (Next.js)
                 db (Postgres 18) ◀── backend, worker, cron, migrate
```

| Service | What it does |
|---|---|
| `caddy` | HTTPS (certificate from Let's Encrypt, renewed automatically), routes `/api/*` to the backend and everything else to the frontend |
| `migrate` | Runs `manage.py migrate` as the owner role on every `up`, then exits. The other backend services wait for it |
| `backend` | The API |
| `worker` | Sends queued notifications to Telegram (`send_notifications --loop`) |
| `cron` | 08:00 monthly invoices, 09:00 payment reminders, 02:30 database backup (Asia/Tashkent) |
| `frontend` | The web app |
| `db` | Postgres. Not reachable from outside the server |

## Server requirements

- Ubuntu 22.04/24.04 (any Linux with Docker works), 2 vCPU, 4 GB RAM, 40 GB disk is a comfortable start
- Docker Engine with the Compose plugin: https://docs.docker.com/engine/install/ubuntu/
- Ports 80 and 443 open. Nothing else needs to be public
- A domain whose DNS **A record points at the server's IP** (Caddy cannot get a certificate otherwise)

## First deploy

```bash
git clone https://github.com/inamtoy/mentorio.git
cd mentorio/deploy
cp .env.example .env
nano .env        # fill in every empty value — see the comments in the file
docker compose up -d --build
```

The first build takes a few minutes. Check it:

```bash
docker compose ps              # migrate should be "exited (0)", the rest "running"
docker compose logs -f backend
```

Then open `https://<your domain>/login`.

### Create the super admin

```bash
docker compose run --rm tools python manage.py create_super_admin \
  --first-name Ism --last-name Familiya --phone +998901234567
```

It asks for the password and prints the `login_id` (e.g. `EDU100001`). The
`tools` service connects as the BYPASSRLS role, because this command creates
the platform organization before any tenant context exists. The normal
`backend` role can't do that.

### Onboard a center

In the Super-Admin portal: **Centers → add** the center, then
**Administrators → add** its Center Admin with a password. Give those
credentials to the center; they continue from the Admin portal.

### Telegram bot

Create a separate production bot with @BotFather (the local-dev bot keeps
polling and can't share a webhook), put its values in `.env`, then:

```bash
docker compose up -d
docker compose exec backend python manage.py set_telegram_webhook \
  https://<your domain>/api/v1/auth/telegram/webhook/
```

## Updating

```bash
cd mentorio && git pull
cd deploy && docker compose up -d --build
```

Migrations run automatically before the new backend starts.

## Backups

The `cron` service writes `pg_dump` files every night to the `db_backups`
volume and keeps 14 days (`DB_BACKUP_KEEP_DAYS`). **They are on the same
disk as the database**, so also copy them off the server (another machine,
object storage) regularly. A disk failure takes both otherwise.

```bash
docker compose exec cron ls -lh /data/db-backups          # list
docker compose exec cron sh /app/deploy-scripts/backup-db.sh   # take one now
docker compose cp cron:/data/db-backups/<file>.dump .     # copy out
```

Restore into a fresh database (the three roles already exist in the `db`
container):

```bash
docker compose stop backend worker cron
docker compose cp <file>.dump db:/tmp/restore.dump
docker compose exec db psql -U postgres -c "DROP DATABASE educore WITH (FORCE)"
docker compose exec db psql -U postgres -c "CREATE DATABASE educore OWNER educore_owner"
docker compose exec db pg_restore -U postgres -d educore --exit-on-error /tmp/restore.dump
docker compose up -d
```

## Database roles

`postgres/init.sh` runs once, on the first start of an empty `pgdata`
volume, and applies `postgres/roles.sql`:

- `educore_owner` owns the schema and is used only by `migrate`
- `educore_app` serves every request; row-level security applies to it
- `educore_auth_bypass` (BYPASSRLS) is used only for the login lookup, backups
  and the `tools` service

Default privileges give the two runtime roles access to every schema and
table `migrate` creates later, so new apps need no manual `GRANT`.

Changing a DB password in `.env` after the first start does **not** change it
in Postgres. Run `ALTER ROLE ... PASSWORD` in `docker compose exec db psql -U
postgres` as well.

## Logs

```bash
docker compose logs -f backend worker cron
```

Django logs unhandled errors with their traceback to stdout (see
`backend/config/settings/prod.py`).
