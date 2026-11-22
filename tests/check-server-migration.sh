#!/usr/bin/env bash
# Integration check: only isolated Compose projects, no public ports or application.
set -euo pipefail
umask 077
work=$(mktemp -d /tmp/deanery-migration-check.XXXXXX)
suffix="$(date +%s)-$$"
source_project="migration-source-$suffix"
target_project="migration-target-$suffix"
cleanup() {
  docker compose --env-file "$work/.env.server" -p "$source_project" -f compose.yaml down -v >/dev/null 2>&1 || true
  docker compose --env-file "$work/.env.server" -p "$target_project" -f compose.yaml down -v >/dev/null 2>&1 || true
  GNUPGHOME="$work/gnupg" gpgconf --kill all >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT
node scripts/init-server-env.mjs migration.example.org "$work/.env.server"
source_dc=(docker compose --env-file "$work/.env.server" -p "$source_project" -f compose.yaml)
target_dc=(docker compose --env-file "$work/.env.server" -p "$target_project" -f compose.yaml)
"${source_dc[@]}" config --quiet
# Validate the bridge configuration without accessing or printing actual key files.
TESLA_QWEN_SSH_KEY="$work/key" TESLA_QWEN_KNOWN_HOSTS="$work/known_hosts" \
  docker compose --env-file "$work/.env.server" -p "$source_project" -f compose.yaml -f compose.qwen.yaml config --quiet
"${source_dc[@]}" up -d --wait db
"${target_dc[@]}" up -d --wait db
"${source_dc[@]}" exec -T db psql -U deanery_owner -d deanery -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE public.sessions (token_hash text);
INSERT INTO public.sessions VALUES ('synthetic-session-must-not-migrate');
CREATE TABLE public.migration_probe (id serial primary key, value text NOT NULL);
INSERT INTO public.migration_probe(value) VALUES ('synthetic-request-retained');
SQL
mkdir -p "$work/documents/versions/probe/revision" "$work/gnupg"
chmod 700 "$work/gnupg"
printf 'synthetic document fixture\n' > "$work/documents/versions/probe/revision/original.pdf"
export GNUPGHOME="$work/gnupg"
gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Migration fixture <migration@example.invalid>' default default 1d >/dev/null 2>&1
bash scripts/backup-server.sh "$work/.env.server" "$source_project" "$work/documents" "$work/backup.tar.gpg" migration@example.invalid
if bash scripts/backup-server.sh "$work/.env.server" "$source_project" "$work/documents" "$work/backup.tar.gpg" migration@example.invalid; then
  echo 'Backup incorrectly overwrote an existing file' >&2
  exit 1
fi
mkdir "$work/restore"
gpg --batch --output "$work/restore/archive.tar" --decrypt "$work/backup.tar.gpg" 2>/dev/null
tar -xf "$work/restore/archive.tar" -C "$work/restore"
(cd "$work/restore" && sha256sum --check SHA256SUMS)
"${target_dc[@]}" exec -T db pg_restore -U deanery_owner -d deanery --no-owner --no-acl --exit-on-error --single-transaction < "$work/restore/database.dump"
sessions=$("${target_dc[@]}" exec -T db psql -U deanery_owner -d deanery -Atc 'SELECT count(*) FROM sessions')
probe=$("${target_dc[@]}" exec -T db psql -U deanery_app -d deanery -Atc 'SELECT value FROM migration_probe')
[[ "$sessions" == 0 && "$probe" == synthetic-request-retained ]]
cmp "$work/documents/versions/probe/revision/original.pdf" "$work/restore/documents/versions/probe/revision/original.pdf"
echo 'Migration preparation passed: Compose, encrypted round trip, retained data/documents, empty sessions, application grants, no overwrite.'
