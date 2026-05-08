#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "[ERROR] $1" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || fail "npm is required"

echo "[1/9] backend npm install"
(cd backend && npm install)
echo "[2/9] backend prisma format"
(cd backend && npm run prisma:format)
echo "[3/9] backend prisma validate"
(cd backend && DATABASE_URL=${DATABASE_URL:-postgresql://streamforge:streamforge@localhost:5432/streamforge?schema=public} npm run prisma:validate)
echo "[4/9] backend prisma generate"
(cd backend && npm run prisma:generate)
echo "[5/9] backend build"
(cd backend && npm run build)
echo "[6/9] frontend npm install"
(cd frontend && npm install)
echo "[7/9] frontend build"
(cd frontend && npm run build)

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "[8/9] docker compose build"
  docker compose build
else
  echo "[WARN] Docker not found; skipping docker compose build"
fi

echo "[9/10] Validation completed"

if [[ "${RUN_SMOKE_TEST:-false}" == "true" ]]; then
  echo "[10/10] running local smoke test"
  bash scripts/smoke-test-local.sh
else
  echo "[10/10] smoke test skipped (set RUN_SMOKE_TEST=true to run)"
fi
