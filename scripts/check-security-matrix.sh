#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export SITE_ADDRESS=localhost
export APP_ORIGIN=https://localhost:8443
export DEMO_ACADEMIC_NOW=2026-11-17T06:00:00Z
export PLAYWRIGHT_BASE_URL="$APP_ORIGIN"
export REQUESTS_TEST_ORIGIN="$APP_ORIGIN"
export INBOX_TEST_ORIGIN="$APP_ORIGIN"
export SAME_GROUP_TEST_ORIGIN="$APP_ORIGIN"

compose=(docker compose -p "deanery-matrix-$$" -f compose.yaml -f tests/compose.requests.yaml -f tests/compose.security.yaml)
db() {
  "${compose[@]}" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}
trap '"${compose[@]}" down -v' EXIT

"${compose[@]}" up -d --wait --no-build --scale app=2
"${compose[@]}" run --rm --no-deps seed
INTERFACE_TEST_DATABASE_URL="$(node --env-file=.env -e '
 const url = new URL(process.env.MIGRATION_DATABASE_URL);
 url.hostname = "127.0.0.1";
 url.port = "55432";
 process.stdout.write(url.href);
')"
export INTERFACE_TEST_DATABASE_URL

for spec in request-size academics auth inbox requests interface-data; do
  # Each suite starts with a fresh login budget in this disposable database.
  db <<< 'DELETE FROM login_rate_limits;'
  if [[ "$spec" == auth ]]; then
    npx --no-install playwright test tests/e2e/auth.spec.ts --grep-invert 'unknown login'
    db <<< 'DELETE FROM login_rate_limits;'
    npx --no-install playwright test tests/e2e/auth.spec.ts -g 'unknown login'
  else
    npx --no-install playwright test "tests/e2e/$spec.spec.ts"
  fi
done

db <<< 'DELETE FROM login_rate_limits;'
db < tests/fixtures/same-group-isolation.sql
npx --no-install playwright test tests/e2e/same-group-isolation.spec.ts
node scripts/check-security-artifacts.mjs "${compose[@]:1}"
