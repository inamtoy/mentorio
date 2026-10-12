#!/bin/sh
# Runs once, on the first start of an empty Postgres volume (the postgres
# image executes /docker-entrypoint-initdb.d/*.sh as the superuser).
# roles.sql is mounted outside initdb.d on purpose: the image would also
# run a bare *.sql there, without the variables it needs.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v db="$DB_NAME" \
  -v owner="$DB_OWNER_USER" -v owner_pw="$DB_OWNER_PASSWORD" \
  -v app="$DB_USER" -v app_pw="$DB_PASSWORD" \
  -v bypass="$DB_AUTH_BYPASS_USER" -v bypass_pw="$DB_AUTH_BYPASS_PASSWORD" \
  -f /mentorio/roles.sql
