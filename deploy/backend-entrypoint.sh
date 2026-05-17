#!/bin/sh
# deploy/backend-entrypoint.sh — bring the database schema up to date, then
# serve. The ent migration is additive-only (creates missing tables/columns,
# drops nothing) so it is safe to run on every container start: it lays down
# the full ent schema (users, blog_posts, …) that `promote` then fills with
# derived rows, and leaves runtime tables untouched.
set -e

DB_SOURCE="${SILAN_DB_SOURCE:-/data/portfolio.db?_fk=1}"

echo "[entrypoint] running ent schema migration on ${DB_SOURCE}"
/app/migrate -db-driver sqlite3 -db-source "${DB_SOURCE}"

echo "[entrypoint] starting backend"
exec /app/silan-backend \
  -f /app/etc/backend-api.yaml \
  -db-driver sqlite3 \
  -db-source "${DB_SOURCE}" \
  -host 0.0.0.0 \
  -port 5200
