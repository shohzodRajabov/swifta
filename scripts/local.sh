#!/usr/bin/env bash
# One-command local start: database, migrations, seed (+ demo data on first run), dev server.
#   ./scripts/local.sh          -> http://localhost:3000
#   PORT=3100 ./scripts/local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || {
  cp .env.example .env
  sed -i.bak 's#^DATABASE_URL=.*#DATABASE_URL="postgresql://swifta:swifta@localhost:5435/swifta"#' .env
  sed -i.bak "s#^AUTH_SECRET=.*#AUTH_SECRET=\"$(openssl rand -hex 32)\"#" .env
  rm -f .env.bak
}

if ! docker ps --format '{{.Names}}' | grep -q '^swifta-db$'; then
  docker start swifta-db >/dev/null 2>&1 || docker compose up -d db
fi
until docker exec swifta-db pg_isready -U swifta >/dev/null 2>&1; do sleep 1; done

[ -d node_modules ] || pnpm install
pnpm exec prisma migrate deploy
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-admin12345}" pnpm db:seed
if [ "$(docker exec swifta-db psql -U swifta -tAc 'select count(*) from "Company" where "isDemo"')" = "0" ]; then
  pnpm db:demo
fi

echo
echo "Swifta: http://localhost:${PORT:-3000}  (admin@swifta.uz / admin12345 — local only)"
exec pnpm dev --port "${PORT:-3000}"
