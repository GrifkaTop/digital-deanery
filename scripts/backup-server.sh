#!/usr/bin/env bash
# Run from the repository root. Does not stop services or modify the database.
set -euo pipefail
umask 077
if [[ $# != 5 ]]; then
  echo 'Usage: bash scripts/backup-server.sh ENV_FILE COMPOSE_PROJECT DOCUMENT_ROOT NEW_OUTPUT.tar.gpg GPG_RECIPIENT' >&2
  exit 2
fi
env_file=$1
project=$2
document_root=$(realpath -- "$3")
output=$(realpath -m -- "$4")
recipient=$5
[[ -f "$env_file" && -d "$document_root/versions" && ! -e "$output" ]]
work=$(mktemp -d "$(dirname "$output")/.deanery-backup.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
dc=(docker compose --env-file "$env_file" -p "$project" -f compose.yaml)
"${dc[@]}" exec -T db pg_dump -U deanery_owner -d deanery \
  --format=custom --no-owner --no-acl --exclude-table-data=public.sessions > "$work/database.dump"
mkdir "$work/documents"
cp -a -- "$document_root/versions" "$work/documents/versions"
git rev-parse HEAD > "$work/source-commit.txt"
date -u +%FT%TZ > "$work/created-at.txt"
(cd "$work" && sha256sum database.dump > SHA256SUMS && \
  find documents -type f -print0 | sort -z | xargs -0 -r sha256sum >> SHA256SUMS)
# gpg writes exclusively to a new file; no plaintext archive remains on disk.
tar -C "$work" -cf - database.dump documents source-commit.txt created-at.txt SHA256SUMS | \
  gpg --batch --encrypt --recipient "$recipient" --output "$work/backup.tar.gpg"
ln -- "$work/backup.tar.gpg" "$output"
echo 'Encrypted backup created. Copy it off this host and rehearse restoration.'
