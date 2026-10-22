# Mentorio'ni serverga joylash

Ishlab turgan server: **mentorio.uz** — Ubuntu, systemd + nginx + PostgreSQL,
Docker'siz. Keyinchalik shu serverga boshqa loyihalar (masalan Prava.uz)
qo'shiladi, shuning uchun hamma narsa loyiha nomi bilan ajratilgan.

```
internet ─443─▶ nginx ─/api/──────────▶ mentorio.service           127.0.0.1:8001  (gunicorn, Django)
                  │   ─/_next/static/─▶ diskdan (frontend/.next/static)
                  └── qolgani ────────▶ mentorio-frontend.service  127.0.0.1:3001  (Next.js)
                 mentorio-worker.service  — Telegram bildirishnomalari
                 PostgreSQL               127.0.0.1:5432
                 /etc/cron.d/mentorio    — 08:00 hisob-fakturalar, 09:00 eslatmalar, 03:00 backup
```

| Fayl | Vazifasi |
|---|---|
| `setup_server.sh` | Idempotent sozlash: `base` (server poydevori), `app` (Mentorio), `cert EMAIL` (HTTPS), `harden-ssh` |
| `deploy.sh` | Yangilash: git pull → bog'liqliklar → migratsiya → frontend build → restart → health check |
| `backup.sh <loyiha>` | Kunlik `pg_dump` (gzip) + media arxivi, 7 kun saqlanadi, `/var/backups/<loyiha>/` |
| `mentorio*.service` | systemd: API, worker, frontend |
| `nginx-mentorio.conf` | HTTPS konfiguratsiya (www → mentorio.uz, http → https). `nginx-mentorio-http.conf` — sertifikat olinguncha |
| `nginx-proxy-snippet.conf`, `nginx-ssl-params.conf` | `/etc/nginx/snippets/` ga o'rnatiladi |
| `mentorio.cron` | `/etc/cron.d/mentorio` |
| `postgres/roles.sql` | Uch DB roli va baza |

## Serverga joylash

Yangi Ubuntu (24.04+) server, root'ga SSH kalit bilan kirish bor, domen A
yozuvlari server IP'siga qaratilgan.

**1. Poydevor** (lokal kompyuterdan, repo kerak emas):

```bash
ssh root@SERVER 'bash -s base' < deploy/setup_server.sh
```

Vaqt zonasi Asia/Tashkent, RAM < 2 GB bo'lsa 2 GB swap, `deploy` foydalanuvchisi
(root'ning SSH kalitlari bilan, parolsiz sudo), ufw (faqat 22/80/443),
fail2ban, unattended-upgrades, PostgreSQL, nginx, certbot, Node 22, uv.

**2. GitHub deploy key** (har loyiha uchun alohida kalit — GitHub bitta kalitni ikki repoga bermaydi):

```bash
ssh deploy@SERVER
ssh-keygen -t ed25519 -N "" -C "deploy@server mentorio" -f ~/.ssh/github_mentorio
cat >> ~/.ssh/config <<'CFG'
Host github-mentorio
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_mentorio
    IdentitiesOnly yes
CFG
cat ~/.ssh/github_mentorio.pub   # → GitHub: repo Settings → Deploy keys (read-only)
git clone git@github-mentorio:inamtoy/mentorio.git ~/mentorio
```

**3. Ilova:**

```bash
sudo bash ~/mentorio/deploy/setup_server.sh app
```

`backend/.env` (600, tasodifiy maxfiy kalitlar va DB parollari), DB rollari +
baza, systemd xizmatlari, nginx sayti (HTTP), cron, birinchi build va ishga
tushirish.

**4. HTTPS** (DNS tarqalgandan keyin — skript avval `dig` bilan tekshiradi):

```bash
sudo bash ~/mentorio/deploy/setup_server.sh cert you@example.com
```

Let's Encrypt sertifikati (webroot; yangilashni `certbot.timer` qiladi va
nginx'ni reload qiladi), HTTPS nginx konfiguratsiyasi, `DJANGO_HTTPS=true`
(SSL redirect, HSTS, Secure cookie'lar). Frontend qayta build qilinmaydi: u API'ni
nisbiy `/api/` yo'li bilan chaqiradi (`NEXT_PUBLIC_API_URL` bo'sh, `frontend/.env.example`).

> `DJANGO_HTTPS=false` faqat sertifikat olinguncha. HTTP'da login ishlashi
> uchun kerak (brauzer Secure cookie'ni http'da saqlamaydi), lekin parol
> ochiq tarmoqdan o'tadi — uzoq qoldirmang.

**5. Super admin:**

```bash
cd ~/mentorio/backend
set -a; . ./.env; set +a
DJANGO_SETTINGS_MODULE=config.settings.prod DB_USER=$DB_AUTH_BYPASS_USER DB_PASSWORD=$DB_AUTH_BYPASS_PASSWORD \
  .venv/bin/python manage.py create_super_admin --first-name Ism --last-name Familiya --phone +998901234567
```

Parolni so'raydi va `login_id` ni chiqaradi. BYPASSRLS roli kerak: buyruq
platforma tashkilotini hali hech qanday tenant konteksti yo'q paytda yaratadi.

**6. SSH'ni faqat kalitga o'tkazish** — avval `ssh deploy@SERVER` kalit bilan
ishlashini tekshiring:

```bash
sudo bash ~/mentorio/deploy/setup_server.sh harden-ssh
```

**7. Telegram bot** — production bot (@BotFather), qiymatlarini `backend/.env`
ga yozing, keyin:

```bash
sudo systemctl restart mentorio mentorio-worker
cd ~/mentorio/backend && DJANGO_SETTINGS_MODULE=config.settings.prod \
  .venv/bin/python manage.py set_telegram_webhook https://mentorio.uz/api/v1/auth/telegram/webhook/
```

### Yangilash

```bash
ssh deploy@SERVER '~/mentorio/deploy/deploy.sh'
```

Biror qadam xato bersa skript to'xtaydi va ishlab turgan xizmatlarga tegmaydi.

### Kundalik ishlar

```bash
systemctl status mentorio mentorio-worker mentorio-frontend
journalctl -u mentorio -f                  # API loglari (Django xatolari traceback bilan)
journalctl -u mentorio-frontend -f
tail -f /var/log/mentorio/cron.log /var/log/mentorio/backup.log
sudo /home/deploy/mentorio/deploy/backup.sh mentorio   # hozir backup olish
ls -lh /var/backups/mentorio/
```

### Backup'dan tiklash

Rollar allaqachon mavjud (`setup_server.sh app` yaratgan):

```bash
sudo systemctl stop mentorio mentorio-worker
sudo -u postgres psql -c "DROP DATABASE mentorio WITH (FORCE)"
sudo -u postgres psql -c "CREATE DATABASE mentorio OWNER mentorio ENCODING 'UTF8' TEMPLATE template0"
gunzip -c /var/backups/mentorio/mentorio-YYYYmmdd-HHMM.sql.gz | sudo -u postgres psql -v ON_ERROR_STOP=1 -d mentorio
sudo systemctl start mentorio mentorio-worker
```

Backup'lar baza bilan bir diskda — ularni muntazam server tashqarisiga ham
ko'chiring.

### Ma'lumotlar bazasi rollari

- `mentorio` — sxema egasi, faqat `migrate` (deploy.sh) uchun. CREATEDB yo'q
- `mentorio_app` — har bir so'rov; row-level security unga to'liq ta'sir qiladi
- `mentorio_auth_bypass` (BYPASSRLS) — faqat login qidiruvi, platforma backup'i va `create_super_admin`

Loyihaning RLS dizayni uchta rolni talab qiladi: ega rol va BYPASSRLS rolida
RLS ishlamaydi, shuning uchun ilova ularning hech biri bilan oddiy so'rov bajarmaydi.

## Serverga yangi loyiha qo'shish

Masalan Prava.uz. `base` qismini qayta bajarish shart emas (u umumiy).

1. **Port tanlang** — band portlar: `ss -tlnp`. Mentorio: 8001 (API), 3001 (frontend). Prava uchun 8000 bo'sh qoldirilgan.
2. **Alohida deploy key**: `~/.ssh/github_prava` + `~/.ssh/config` da `Host github-prava` (yuqoridagi 2-qadam kabi), `git clone git@github-prava:OWNER/REPO.git ~/prava`.
3. **Baza**: alohida rol va baza, kuchli parol bilan:
   `sudo -u postgres psql -c "CREATE ROLE prava LOGIN PASSWORD '...'"`,
   `sudo -u postgres psql -c "CREATE DATABASE prava OWNER prava ENCODING 'UTF8' TEMPLATE template0"`.
4. **systemd**: `/etc/systemd/system/prava.service` — `User=deploy`, faqat `127.0.0.1:<port>` ga bind.
5. **nginx**: `/etc/nginx/sites-available/prava` + `sites-enabled` ga symlink, o'z `server_name` i bilan. upstream nomlari loyihaga xos bo'lsin (`prava_api`), `snippets/ssl-params.conf` ni qayta ishlating. Mentorio fayllariga tegmang.
6. **Sertifikat**: `sudo certbot certonly --webroot -w /var/www/certbot --cert-name prava.uz -d prava.uz -d www.prava.uz` (nginx'da `/.well-known/acme-challenge/` → `/var/www/certbot` bo'lishi kerak).
7. **Backup**: `/etc/cron.d/prava` ga `0 3 * * * root /home/deploy/mentorio/deploy/backup.sh prava >> /var/log/prava-backup.log 2>&1` (baza nomi loyiha nomidan farq qilsa `DB_NAME=...`, media boshqa joyda bo'lsa `MEDIA_DIR=...`).
8. **RAM**: `free -h` — har bir gunicorn worker ~100–150 MB, Next.js ~150 MB.

## Muqobil: Docker Compose (Caddy bilan)

Quyidagisi — bitta serverga Docker bilan joylash varianti (`docker-compose.yml`,
`Caddyfile`, `cron/`). mentorio.uz serveri undan foydalanmaydi; yuqoridagi
systemd + nginx usuli asosiy.

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

### Server requirements

- Ubuntu 22.04/24.04 (any Linux with Docker works), 2 vCPU, 4 GB RAM, 40 GB disk is a comfortable start
- Docker Engine with the Compose plugin: https://docs.docker.com/engine/install/ubuntu/
- Ports 80 and 443 open. Nothing else needs to be public
- A domain whose DNS **A record points at the server's IP** (Caddy cannot get a certificate otherwise)

### First deploy

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

### Updating

```bash
cd mentorio && git pull
cd deploy && docker compose up -d --build
```

Migrations run automatically before the new backend starts.

### Backups

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

### Database roles

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

### Logs

```bash
docker compose logs -f backend worker cron
```

Django logs unhandled errors with their traceback to stdout (see
`backend/config/settings/prod.py`).
