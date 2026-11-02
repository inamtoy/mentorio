#!/usr/bin/env bash
# Idempotent server setup for Mentorio on Ubuntu (24.04+). Run as root.
# Safe to re-run: every step checks before it changes anything.
#
#   base         server-wide foundation, shared with future projects:
#                swap, packages, deploy user, ufw, fail2ban, unattended
#                upgrades, PostgreSQL, nginx, certbot, Node, uv.
#                Needs no repo checkout:  ssh root@HOST 'bash -s base' < setup_server.sh
#   app          Mentorio itself (repo must already be at /home/deploy/mentorio):
#                DB roles + database, backend/.env, systemd units, nginx site, cron.
#   cert EMAIL   Let's Encrypt certificate for mentorio.uz + www, switches
#                nginx and Django to HTTPS.
#   harden-ssh   PasswordAuthentication no. Run only after confirming
#                `ssh deploy@HOST` works with a key.
#   configs      Re-install nginx/systemd/cron files from deploy/ after they
#                change (deploy.sh only updates code). Restarts nothing but
#                nginx (a reload); the next deploy.sh restarts the services.
#   cf-firewall  After the Cloudflare proxy (orange cloud) is on: ports 80/443
#                accept only Cloudflare's ranges, so the origin can't be hit
#                directly. Refuses to run while DNS still points here.
set -euo pipefail

APP=mentorio
APP_USER=deploy
APP_DIR=/home/$APP_USER/$APP
DOMAIN=mentorio.uz
DOMAINS=(mentorio.uz www.mentorio.uz)
NODE_MAJOR=22
UV_VERSION=0.13.0

log() { printf '\n==> %s\n' "$*"; }
rnd() { openssl rand -hex 32; }

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }

phase_base() {
    log "Timezone"
    timedatectl set-timezone Asia/Tashkent

    log "Swap (2 GB /swapfile if RAM < 2 GB and swap < 2 GB)"
    local mem_mb swap_mb
    mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    swap_mb=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
    if (( mem_mb < 2000 && swap_mb < 1900 )) && [[ ! -f /swapfile ]]; then
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
        sysctl -p /etc/sysctl.d/99-swappiness.conf
    fi

    log "Packages"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get -y upgrade
    apt-get install -y --no-install-recommends \
        ca-certificates curl git gnupg openssl ufw fail2ban unattended-upgrades \
        postgresql postgresql-contrib nginx certbot python3-certbot-nginx \
        build-essential dnsutils
    dpkg-reconfigure -f noninteractive unattended-upgrades

    log "Node.js $NODE_MAJOR LTS"
    if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') -lt $NODE_MAJOR ]]; then
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
        apt-get install -y nodejs
    fi
    # Ubuntu's own nodejs package ships without npm (NodeSource's includes it).
    command -v npm >/dev/null || apt-get install -y npm

    log "Deploy user"
    if ! id "$APP_USER" >/dev/null 2>&1; then
        adduser --disabled-password --gecos "" "$APP_USER"
    fi
    usermod -aG sudo "$APP_USER"
    # Key-only account (no password to type), so sudo can't prompt for one.
    echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-$APP_USER
    chmod 440 /etc/sudoers.d/90-$APP_USER
    install -d -m 700 -o "$APP_USER" -g "$APP_USER" /home/$APP_USER/.ssh
    if [[ -s /root/.ssh/authorized_keys ]]; then
        touch /home/$APP_USER/.ssh/authorized_keys
        # Append root's keys that deploy doesn't have yet.
        grep -vxFf /home/$APP_USER/.ssh/authorized_keys /root/.ssh/authorized_keys \
            >> /home/$APP_USER/.ssh/authorized_keys || true
        chown "$APP_USER:$APP_USER" /home/$APP_USER/.ssh/authorized_keys
        chmod 600 /home/$APP_USER/.ssh/authorized_keys
    fi
    # nginx (www-data) must traverse the home dir to serve each project's
    # static files; 711 lets it pass through without listing anything.
    chmod 711 /home/$APP_USER

    log "uv $UV_VERSION (Python toolchain)"
    if ! sudo -u "$APP_USER" bash -lc "~/.local/bin/uv --version 2>/dev/null | grep -q '$UV_VERSION'"; then
        sudo -u "$APP_USER" bash -lc "curl -LsSf https://astral.sh/uv/$UV_VERSION/install.sh | sh"
    fi

    log "Firewall: only 22, 80, 443"
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable

    log "fail2ban (sshd jail)"
    cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
    systemctl enable --now fail2ban
    systemctl restart fail2ban

    log "nginx: drop the default site"
    rm -f /etc/nginx/sites-enabled/default
    install -d /var/www/certbot
    systemctl enable --now nginx postgresql

    log "base done"
}

# Reads KEY from backend/.env.
env_get() { grep -E "^$1=" "$APP_DIR/backend/.env" | head -1 | cut -d= -f2-; }

phase_app() {
    [[ -d $APP_DIR/.git ]] || { echo "Clone the repo to $APP_DIR first." >&2; exit 1; }
    local env_file=$APP_DIR/backend/.env

    log "Production backend/.env"
    if [[ ! -f $env_file ]]; then
        local https=false
        [[ -d /etc/letsencrypt/live/$DOMAIN ]] && https=true
        umask 077
        cat > "$env_file" <<EOF
# Generated by deploy/setup_server.sh. Never commit; keep mode 600.
DJANGO_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n/+=')
DJANGO_HTTPS=$https
DJANGO_ALLOWED_HOSTS=mentorio.uz,www.mentorio.uz
CSRF_TRUSTED_ORIGINS=https://mentorio.uz,https://www.mentorio.uz
CORS_ALLOWED_ORIGINS=https://mentorio.uz,https://www.mentorio.uz
PAYMENT_GATEWAY_ENCRYPTION_KEY=$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '\n')

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$APP
# Owns the schema; deploy.sh runs migrate as this role.
DB_OWNER_USER=$APP
DB_OWNER_PASSWORD=$(rnd)
# Every request. Row-level security applies to it.
DB_USER=${APP}_app
DB_PASSWORD=$(rnd)
# Login lookup, platform backups, create_super_admin (BYPASSRLS).
DB_AUTH_BYPASS_USER=${APP}_auth_bypass
DB_AUTH_BYPASS_PASSWORD=$(rnd)

# Production Telegram bot (a different bot from the local-dev one).
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=$(rnd)

LOG_LEVEL=INFO
EOF
        umask 022
    fi
    chown "$APP_USER:$APP_USER" "$env_file"
    chmod 600 "$env_file"

    # Empty API origin: the browser calls /api/ on whatever host served the
    # page, so the build needn't change between IP, domain, http and https.
    local fe_env=$APP_DIR/frontend/.env.production
    install -m 644 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/frontend/.env.example" "$fe_env"

    log "PostgreSQL roles + database"
    if ! sudo -u postgres psql -Atc "SELECT 1 FROM pg_roles WHERE rolname='$(env_get DB_OWNER_USER)'" | grep -q 1; then
        sudo -u postgres psql -v ON_ERROR_STOP=1 \
            -v db="$(env_get DB_NAME)" \
            -v owner="$(env_get DB_OWNER_USER)" -v owner_pw="$(env_get DB_OWNER_PASSWORD)" \
            -v app="$(env_get DB_USER)" -v app_pw="$(env_get DB_PASSWORD)" \
            -v bypass="$(env_get DB_AUTH_BYPASS_USER)" -v bypass_pw="$(env_get DB_AUTH_BYPASS_PASSWORD)" \
            -f - < "$APP_DIR/deploy/postgres/roles.sql"
    fi

    log "Logs"
    install -d -o "$APP_USER" -g "$APP_USER" /var/log/$APP

    install_configs

    log "First build + start (deploy.sh)"
    sudo -u "$APP_USER" bash -lc "$APP_DIR/deploy/deploy.sh --no-pull"

    log "app done"
}

install_configs() {
    log "systemd units"
    for unit in $APP.service $APP-worker.service $APP-frontend.service; do
        install -m 644 "$APP_DIR/deploy/$unit" /etc/systemd/system/$unit
    done
    systemctl daemon-reload
    systemctl enable $APP.service $APP-worker.service $APP-frontend.service

    log "Cron"
    install -m 644 "$APP_DIR/deploy/$APP.cron" /etc/cron.d/$APP
    chmod 755 "$APP_DIR/deploy/backup.sh" "$APP_DIR/deploy/deploy.sh"

    install_nginx_site
}

phase_cf_firewall() {
    log "Cloudflare proxy check"
    local ip got
    ip=$(curl -fsS https://api.ipify.org)
    got=$(dig +short A "$DOMAIN" @1.1.1.1 | tail -1)
    if [[ -z $got || $got == "$ip" ]]; then
        echo "$DOMAIN resolves to '$got' (this server). Turn on the Cloudflare proxy first, or this would take the site offline." >&2
        exit 1
    fi
    # One source of truth for the ranges: the real_ip list nginx already uses.
    local ranges
    ranges=$(sed -n 's/^set_real_ip_from \(.*\);$/\1/p' "$APP_DIR/deploy/nginx-$APP-limits.conf")
    [[ -n $ranges ]] || { echo "No Cloudflare ranges found in nginx-$APP-limits.conf." >&2; exit 1; }

    log "ufw: 80/443 only from Cloudflare"
    local r
    for r in $ranges; do
        ufw allow proto tcp from "$r" to any port 80,443 comment cloudflare >/dev/null
    done
    ufw delete allow 80/tcp >/dev/null || true
    ufw delete allow 443/tcp >/dev/null || true
    ufw status numbered
    log "cf-firewall done — undo: ufw allow 80/tcp && ufw allow 443/tcp"
}

phase_configs() {
    install_configs
    log "configs done — run deploy.sh to restart the services with new units"
}

install_nginx_site() {
    log "nginx site"
    local src=nginx-$APP-http.conf
    [[ -d /etc/letsencrypt/live/$DOMAIN ]] && src=nginx-$APP.conf
    # source -> installed path. If the new set fails `nginx -t`, the previous
    # files are put back, so a typo can't leave nginx unable to (re)start.
    local -A files=(
        ["nginx-proxy-snippet.conf"]=/etc/nginx/snippets/$APP-proxy.conf
        ["nginx-ssl-params.conf"]=/etc/nginx/snippets/ssl-params.conf
        ["nginx-security-headers.conf"]=/etc/nginx/snippets/$APP-security-headers.conf
        ["nginx-$APP-limits.conf"]=/etc/nginx/conf.d/$APP-limits.conf
        ["$src"]=/etc/nginx/sites-available/$APP
    )
    local backup
    backup=$(mktemp -d)
    local name dest
    for name in "${!files[@]}"; do
        dest=${files[$name]}
        [[ -e $dest ]] && cp -p "$dest" "$backup/$(basename "$dest").$(echo "$dest" | md5sum | cut -c1-8)"
        install -m 644 "$APP_DIR/deploy/$name" "$dest"
    done
    ln -sf /etc/nginx/sites-available/$APP /etc/nginx/sites-enabled/$APP
    if ! nginx -t; then
        echo "nginx -t failed — restoring the previous files; nginx keeps running the old config." >&2
        for name in "${!files[@]}"; do
            dest=${files[$name]}
            local saved="$backup/$(basename "$dest").$(echo "$dest" | md5sum | cut -c1-8)"
            if [[ -e $saved ]]; then cp -p "$saved" "$dest"; else rm -f "$dest"; fi
        done
        nginx -t
        rm -rf "$backup"
        exit 1
    fi
    rm -rf "$backup"
    systemctl reload nginx
}

phase_cert() {
    local email=${1:?usage: setup_server.sh cert EMAIL}
    log "DNS check"
    local ip
    ip=$(curl -fsS https://api.ipify.org)
    for d in "${DOMAINS[@]}"; do
        local got
        got=$(dig +short A "$d" @1.1.1.1 | tail -1)
        [[ $got == "$ip" ]] || { echo "$d resolves to '$got', not $ip. Wait for DNS." >&2; exit 1; }
    done

    log "Certificate (webroot, renewed by certbot.timer)"
    if [[ ! -d /etc/letsencrypt/live/$DOMAIN ]]; then
        certbot certonly --webroot -w /var/www/certbot --cert-name "$DOMAIN" \
            -d mentorio.uz -d www.mentorio.uz \
            --email "$email" --agree-tos --no-eff-email --non-interactive
    fi
    # Reload nginx after every renewal so it picks up the new certificate.
    install -d /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

    install_nginx_site

    log "Django to HTTPS"
    sed -i 's/^DJANGO_HTTPS=.*/DJANGO_HTTPS=true/' "$APP_DIR/backend/.env"
    systemctl restart $APP.service $APP-worker.service

    certbot renew --dry-run
    log "cert done"
}

phase_harden_ssh() {
    [[ -s /home/$APP_USER/.ssh/authorized_keys ]] || { echo "$APP_USER has no SSH key." >&2; exit 1; }
    log "SSH: keys only"
    # 00- sorts before cloud-init's 50-cloud-init.conf; sshd keeps the first value it reads.
    cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
    sshd -t
    systemctl reload ssh
    log "harden-ssh done"
}

case ${1:-} in
    base) phase_base ;;
    app) phase_app ;;
    cert) shift; phase_cert "$@" ;;
    harden-ssh) phase_harden_ssh ;;
    configs) phase_configs ;;
    cf-firewall) phase_cf_firewall ;;
    *) sed -n '2,22p' "$0"; exit 1 ;;
esac
