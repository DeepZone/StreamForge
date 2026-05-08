#!/usr/bin/env bash
set -euo pipefail

# StreamForge local smoke test.
# WARNING: Local development use only. Do not run against production systems.

API_BASE="${API_BASE:-http://localhost:8000}"
COOKIE_JAR="${COOKIE_JAR:-cookies.txt}"
TEST_EMAIL="${SMOKE_TEST_EMAIL:-smoke.owner.local@example.test}"
TEST_PASSWORD="${SMOKE_TEST_PASSWORD:-LocalSmokePass123!}"
TEST_DISPLAY_NAME="${SMOKE_TEST_DISPLAY_NAME:-Local Smoke Owner}"

fail() { echo "[SMOKE][ERROR] $1" >&2; exit 1; }
step() { echo "[SMOKE] $1"; }

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required for JSON parsing"

rm -f "$COOKIE_JAR"

request() {
  local method="$1" url="$2" body="${3:-}"
  local tmp_body tmp_meta status
  tmp_body=$(mktemp)
  tmp_meta=$(mktemp)
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$url" -H 'content-type: application/json' -c "$COOKIE_JAR" -b "$COOKIE_JAR" -d "$body" -o "$tmp_body" -w '%{http_code}' >"$tmp_meta"
  else
    curl -sS -X "$method" "$url" -c "$COOKIE_JAR" -b "$COOKIE_JAR" -o "$tmp_body" -w '%{http_code}' >"$tmp_meta"
  fi
  status=$(cat "$tmp_meta")
  rm -f "$tmp_meta"
  echo "$status|$tmp_body"
}

read_json_bool() {
  local file="$1" key="$2"
  python3 - <<PY "$file" "$key"
import json,sys
f,k=sys.argv[1],sys.argv[2]
try:
  data=json.load(open(f))
  value=data
  for part in k.split('.'):
    value=value.get(part) if isinstance(value,dict) else None
  print(str(bool(value)).lower())
except Exception:
  print("false")
PY
}

step "Checking backend reachability: ${API_BASE}/api/setup/status"
result=$(request GET "${API_BASE}/api/setup/status")
status="${result%%|*}"; body_file="${result#*|}"
[[ "$status" == "200" ]] || fail "Backend not reachable or setup status failed (HTTP $status)"

setup_allowed=$(read_json_bool "$body_file" "setupAllowed")
rm -f "$body_file"

if [[ "$setup_allowed" == "true" ]]; then
  step "Setup is allowed; creating local smoke-test owner"
  payload=$(printf '{"email":"%s","password":"%s","displayName":"%s"}' "$TEST_EMAIL" "$TEST_PASSWORD" "$TEST_DISPLAY_NAME")
  result=$(request POST "${API_BASE}/api/setup/create-owner" "$payload")
  status="${result%%|*}"; body_file="${result#*|}"
  [[ "$status" == "200" || "$status" == "201" ]] || fail "Owner creation failed (HTTP $status). Body: $(cat "$body_file")"
  rm -f "$body_file"
else
  step "Setup already completed; trying login with local smoke-test credentials"
fi

step "POST /api/auth/login"
login_payload=$(printf '{"email":"%s","password":"%s"}' "$TEST_EMAIL" "$TEST_PASSWORD")
result=$(request POST "${API_BASE}/api/auth/login" "$login_payload")
status="${result%%|*}"; body_file="${result#*|}"
if [[ "$status" != "200" ]]; then
  echo "[SMOKE][WARN] Login with smoke-test credentials failed (HTTP $status)."
  echo "[SMOKE][WARN] If setup already existed, use existing local owner credentials via:"
  echo "  SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... bash scripts/smoke-test-local.sh"
  fail "Cannot continue smoke test without authenticated session. Body: $(cat "$body_file")"
fi
rm -f "$body_file"

step "GET /api/auth/me"
result=$(request GET "${API_BASE}/api/auth/me")
status="${result%%|*}"; body_file="${result#*|}"
[[ "$status" == "200" ]] || fail "/api/auth/me failed (HTTP $status). Body: $(cat "$body_file")"
rm -f "$body_file"

step "GET /api/channels"
result=$(request GET "${API_BASE}/api/channels")
status="${result%%|*}"; body_file="${result#*|}"
[[ "$status" == "200" ]] || fail "/api/channels failed (HTTP $status). Body: $(cat "$body_file")"
rm -f "$body_file"

step "GET /api/admin/health"
result=$(request GET "${API_BASE}/api/admin/health")
status="${result%%|*}"; body_file="${result#*|}"
[[ "$status" == "200" || "$status" == "403" ]] || fail "/api/admin/health unexpected HTTP $status. Body: $(cat "$body_file")"
rm -f "$body_file"

step "Smoke test finished successfully"
