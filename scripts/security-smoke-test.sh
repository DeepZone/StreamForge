#!/usr/bin/env bash
set -euo pipefail
API_BASE="${API_BASE:-https://www.streamforge-bot.com/api}"
RID=$(curl -si "$API_BASE/public/health" | awk 'tolower($1$2)=="x-request-id:"{print $2}' | tr -d '\r')
echo "health request-id: ${RID:-missing}"
curl -s "$API_BASE/does-not-exist" | jq . >/dev/null || true
curl -si -X POST "$API_BASE/auth/login" -H 'content-type: application/json' -d '{}' | grep -E '400|401' >/dev/null
BIG=$(python - <<'PY'
print('a'*300000)
PY
)
curl -si -X POST "$API_BASE/auth/login" -H 'content-type: application/json' -d "{\"email\":\"x@y.z\",\"password\":\"$BIG\"}" | grep -E '413|429|400' >/dev/null || true
curl -si -X POST "$API_BASE/setup/create-owner" -H 'content-type: application/json' -d '{}' | grep -E '400|403' >/dev/null
curl -si -X OPTIONS "$API_BASE/auth/login" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' | grep -i 'access-control-allow-origin' || true
