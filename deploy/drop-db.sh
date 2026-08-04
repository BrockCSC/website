#!/bin/sh
# Restricted to preview_* schemas so this can never touch prod/dev. Runs as
# the brockcsc role (no superuser) since brockcsc owns every schema it creates.
set -eu
DB_SCHEMA="${1:?usage: drop-db.sh <db_schema>}"

case "$DB_SCHEMA" in
  preview_*) ;;
  *)
    echo "refusing: can only drop preview_* schemas" >&2
    exit 1
    ;;
esac

echo "$DB_SCHEMA" | grep -Eq '^[a-z0-9_]+$' || {
  echo "refusing: invalid schema name '$DB_SCHEMA'" >&2
  exit 1
}

sudo docker exec postgres psql -U brockcsc -d brockcsc -c "DROP SCHEMA IF EXISTS \"$DB_SCHEMA\" CASCADE"
