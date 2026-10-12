-- Creates Mentorio's three database roles and the database, and sets up
-- privileges so the two runtime roles can use every schema and table that
-- `manage.py migrate` creates later, including schemas that don't exist yet.
--
-- Run once, as a superuser, with psql variables:
--   psql -v ON_ERROR_STOP=1 \
--        -v db=educore -v owner=educore_owner -v app=educore_app -v bypass=educore_auth_bypass \
--        -v owner_pw=... -v app_pw=... -v bypass_pw=... -f roles.sql
--
-- owner  : owns the database and runs `migrate`. Not a superuser.
-- app    : every normal request. Not the owner and no BYPASSRLS, so
--          FORCE ROW LEVEL SECURITY applies in full.
-- bypass : login lookup and platform backups only (BYPASSRLS).
--
-- Some apps' seed migrations query through the bypass connection while
-- migrate is still creating schemas, so the grants must already apply to
-- objects as they are created: hence ALTER DEFAULT PRIVILEGES ... FOR ROLE
-- owner (including ON SCHEMAS) instead of a GRANT after migrate.

CREATE ROLE :"owner" LOGIN PASSWORD :'owner_pw';
CREATE ROLE :"app" LOGIN PASSWORD :'app_pw';
CREATE ROLE :"bypass" LOGIN PASSWORD :'bypass_pw' BYPASSRLS;

CREATE DATABASE :"db" OWNER :"owner";
\connect :"db"

ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" GRANT USAGE ON SCHEMAS TO :"app", :"bypass";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner"
    GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON TABLES TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner"
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"bypass";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" GRANT USAGE, SELECT ON SEQUENCES TO :"app", :"bypass";
