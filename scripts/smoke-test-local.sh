#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-https://www.streamforge-bot.com}"
EMAIL="${EMAIL:-}"; PASSWORD="${PASSWORD:-}"; CHANNEL_ID="${CHANNEL_ID:-}"; COOKIE_JAR="${COOKIE_JAR:-cookies.txt}"
req(){ local m=$1 u=$2 d=${3:-}; if [[ -n "$d" ]]; then curl -sS -o /tmp/smoke.body -w '%{http_code}' -X "$m" "$u" -H 'content-type: application/json' -c "$COOKIE_JAR" -b "$COOKIE_JAR" -d "$d"; else curl -sS -o /tmp/smoke.body -w '%{http_code}' -X "$m" "$u" -c "$COOKIE_JAR" -b "$COOKIE_JAR"; fi; }
check(){ local code expected path; expected=$1; path=$2; code=$(req GET "$BASE_URL$path"); echo "[SMOKE] GET $path -> $code"; [[ "$code" == "$expected" ]]; }
rm -f "$COOKIE_JAR"
check 200 /api/setup/status
if [[ -n "$EMAIL" && -n "$PASSWORD" ]]; then code=$(req POST "$BASE_URL/api/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"); echo "[SMOKE] POST /api/auth/login -> $code"; fi
for p in /api/auth/me /api/channels; do code=$(req GET "$BASE_URL$p"); echo "[SMOKE] GET $p -> $code"; done
if [[ -n "$CHANNEL_ID" ]]; then for p in "/api/channels/$CHANNEL_ID" "/api/channels/$CHANNEL_ID/settings" "/api/channels/$CHANNEL_ID/chat/messages" "/api/channels/$CHANNEL_ID/twitch/debug" "/api/channels/$CHANNEL_ID/logs" "/api/channels/$CHANNEL_ID/commands"; do code=$(req GET "$BASE_URL$p"); echo "[SMOKE] GET $p -> $code"; done; fi
code=$(req GET "$BASE_URL/api/admin/health"); echo "[SMOKE] GET /api/admin/health -> $code (optional)"
echo "[SMOKE] done"
