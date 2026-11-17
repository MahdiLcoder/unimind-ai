#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-docker-compose.production.yml}"
backup_file="${1:-}"

if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "Usage: $0 BACKUP_FILE --confirm" >&2
  exit 2
fi

if [ "${2:-}" != "--confirm" ]; then
  echo "Restore replaces conflicting database objects. Re-run with --confirm." >&2
  exit 2
fi

docker compose -f "$compose_file" exec -T postgres \
  sh -c 'exec pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$backup_file"
printf 'Restored PostgreSQL backup: %s\n' "$backup_file"
