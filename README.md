# StreamForge MVP

## Lokaler Start mit Docker Compose

1. `.env.example` nach `.env` kopieren und lokale Werte setzen.
2. Starten: `docker compose up --build`
3. URLs lokal:
   - Frontend: `http://localhost:4173`
   - Backend: `http://localhost:8000`

### Wichtige ENV-Werte für Container
- `DATABASE_URL=postgresql://streamforge:streamforge@postgres:5432/streamforge?schema=public`
- `REDIS_URL=redis://redis:6379`
- `FRONTEND_URL=http://localhost:4173`
- `BACKEND_URL=http://localhost:8000`
- `TWITCH_REDIRECT_URI=http://localhost:8000/api/auth/twitch/callback`
- `TOKEN_ENCRYPTION_KEY=<64 hex chars>`
- `SESSION_SECRET=<long random secret>`
- `TWITCH_EVENTSUB_ENABLED=false` (für den ersten OAuth-Testlauf)

## Lokale Validierung

`bash scripts/validate-local.sh`

Das Skript führt aus:
- Backend install
- Prisma format / validate / generate
- Backend build
- Frontend install / build
- optional `docker compose build`
- optional `bash scripts/smoke-test-local.sh` mit `RUN_SMOKE_TEST=true`

## Lokaler Smoke-Test (ohne echten Twitch OAuth)

`bash scripts/smoke-test-local.sh`

Eigenschaften:
- Nur für lokale Entwicklung gedacht.
- Nutzt Cookie-Jar (`-c cookies.txt`, `-b cookies.txt`).
- Prüft:
  - Backend erreichbar
  - `GET /api/setup/status`
  - ggf. `POST /api/setup/create-owner`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `GET /api/channels`
  - `GET /api/admin/health`
- Bricht bei Fehlern mit Exit-Code `!= 0` ab.

Falls Setup schon abgeschlossen ist und der lokale Smoke-Test-User nicht existiert:
- mit bestehenden Zugangsdaten starten, z. B.
  `SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... bash scripts/smoke-test-local.sh`

## Prisma (Backend)

```bash
cd backend
npm run prisma:format
DATABASE_URL=postgresql://streamforge:streamforge@localhost:5432/streamforge?schema=public npm run prisma:validate
npm run prisma:generate
npm run prisma:push
```

`prisma:push` nur für lokale/dev Datenbanken nutzen.

## Twitch OAuth manuelle E2E-Checkliste

1. Twitch Developer App anlegen.
2. Redirect URL setzen auf `http://localhost:8000/api/auth/twitch/callback`.
3. `.env` setzen:
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET`
   - `TWITCH_REDIRECT_URI`
   - `FRONTEND_URL`
   - `BACKEND_URL`
   - `TOKEN_ENCRYPTION_KEY`
   - `SESSION_SECRET`
   - `TWITCH_EVENTSUB_ENABLED=false`
4. `docker compose up --build`
5. `/setup` aufrufen und ersten Admin anlegen.
6. `/login` mit lokalem Account testen.
7. Twitch Login über Button testen.
8. Prüfen:
   - `/api/auth/me` zeigt Twitch User
   - `/api/channels` zeigt Twitch Channel
   - Dashboard zeigt den Channel
9. Dann `TWITCH_EVENTSUB_ENABLED=true` setzen.
10. Backend neu starten.
11. `/api/admin/health` prüfen.
12. Im Twitch Chat `!ping` schreiben.
13. Prüfen:
   - Bot antwortet
   - ChatMessage gespeichert
   - CommunityUser aktualisiert
   - BotEvent `command_executed` geschrieben
   - `usageCount` erhöht

## Sicherheit

- Keine Secrets oder Tokens loggen.
- Admin Health zeigt nur Statusdaten (z. B. `status`, `connected`, `subscribed`, `lastError`, Counter, Timestamps).
