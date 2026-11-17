#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-docker-compose.production.yml}"
backup_dir="${1:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/unimind-postgres-$timestamp.dump"

umask 077
mkdir -p "$backup_dir"
docker compose -f "$compose_file" exec -T postgres \
  sh -c 'exec pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$backup_file"
printf 'Created PostgreSQL backup: %s\n' "$backup_file"
