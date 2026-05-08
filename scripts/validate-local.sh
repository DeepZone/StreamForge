#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "[ERROR] $1" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || fail "npm is required"

echo "[1/8] backend npm install"
(cd backend && npm install)
echo "[2/8] backend prisma generate"
(cd backend && npm run prisma:generate)
echo "[3/8] backend prisma validate"
(cd backend && npm run prisma:validate)
echo "[4/8] backend build"
(cd backend && npm run build)
echo "[5/8] frontend npm install"
(cd frontend && npm install)
echo "[6/8] frontend build"
(cd frontend && npm run build)

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "[7/8] docker compose build"
  docker compose build
else
  echo "[WARN] Docker not found; skipping docker compose build"
fi

echo "[8/8] Validation completed"
