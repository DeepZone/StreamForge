# StreamForge MVP

## Lokaler Start mit Docker Compose

1. `.env.example` nach `.env` kopieren und lokale Werte setzen.
2. Starten: `docker compose up --build`
3. URLs lokal:
   - Frontend: `http://192.168.58.158:4173`
   - Backend: `http://192.168.58.158:8000`

### Wichtige ENV-Werte für Container
- `DATABASE_URL=postgresql://streamforge:streamforge@postgres:5432/streamforge?schema=public`
- `REDIS_URL=redis://redis:6379`
- `FRONTEND_URL=http://192.168.58.158:4173`
- `BACKEND_URL=http://192.168.58.158:8000`
- `TWITCH_REDIRECT_URI=http://192.168.58.158:8000/api/auth/twitch/callback`
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
DATABASE_URL=postgresql://streamforge:streamforge@192.168.58.158:5432/streamforge?schema=public npm run prisma:validate
npm run prisma:generate
npm run prisma:push
```

`prisma:push` nur für lokale/dev Datenbanken nutzen.

## Twitch OAuth manuelle E2E-Checkliste

1. Twitch Developer App anlegen.
2. Redirect URL setzen auf `http://192.168.58.158:8000/api/auth/twitch/callback`.
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

## Community Radar, FAQ und Recaps (heuristisch, lokal)

- **Community Radar API**: `GET /api/channels/:channelId/community/radar` liefert kanalgebundene Kennzahlen (Nachrichten, aktive Chatter, neue/wiederkehrende Viewer, potenzielle Moderationsunterstützung, Watchlist zur manuellen Prüfung).
- **FAQ-Erkennung API**: `GET /api/channels/:channelId/community/faq` erkennt häufige Fragen über lokale Heuristiken (Fragezeichen, Normalisierung, Frequenzen).
- **Command Suggestions API**: `GET /api/channels/:channelId/commands/suggestions` und `POST /api/channels/:channelId/commands/from-suggestion`.
- **Recaps API**: `POST /api/channels/:channelId/recaps/generate`, `GET /api/channels/:channelId/recaps`, `GET /api/channels/:channelId/recaps/:recapId`.
- **Wichtig**: alle Auswertungen sind ohne externe KI/API implementiert, rein heuristisch und lokal.

### Datenschutz- und Sicherheits-Hinweise

- Keine kanalübergreifenden Auswertungen oder Datenlecks.
- Keine automatische Sanktion oder Moderationsentscheidung.
- Keine Persönlichkeitsdiagnosen.
- Watchlist/Potential-Moderatoren sind ausschließlich heuristische Hinweise zur manuellen Prüfung.

## Ersten Admin anlegen

Ports:
- Frontend: `4173`
- Backend: `8000`

### Variante A: über das Frontend
1. Setup-Seite öffnen: `http://SERVER-IP:4173/setup`
2. Anzeigename, E-Mail und Passwort ausfüllen.
3. Nach Erfolg wird eine Session gesetzt und die App lädt den eingeloggten Nutzer über `/api/auth/me`.

### Variante B: per curl
```bash
curl -i http://192.168.58.158:8000/api/setup/status
curl -i -X POST http://192.168.58.158:8000/api/setup/create-owner \
  -H 'content-type: application/json' \
  -d '{"displayName":"Owner","email":"owner@example.test","password":"Secret123!"}'
curl -i -X POST http://192.168.58.158:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@example.test","password":"Secret123!"}'
curl -i --cookie cookies.txt --cookie-jar cookies.txt http://192.168.58.158:8000/api/auth/me
```

### VITE_API_URL richtig setzen
- Zugriff **vom selben Rechner**: `VITE_API_URL=http://192.168.58.158:8000`
- Zugriff **von einem anderen Gerät im Netzwerk**: `VITE_API_URL=http://<SERVER-IP>:8000`

### Typische Fehler
- **"Login ist aktuell nicht erreichbar"**
  - `VITE_API_URL` zeigt auf falschen Host/Port.
  - Backend läuft nicht oder ist nicht erreichbar.
  - CORS/Credentials blockieren den Request.
  - Session-Cookie wird nicht gesetzt oder nicht mitgesendet.
  - Setup wurde noch nicht durchgeführt.
  - E-Mail/Passwort sind falsch.

## Dashboard Funktionen

- Frontend läuft lokal unter `http://192.168.58.158:4173`.
- Login über `/login`, danach Weiterleitung zur Kanalauswahl (`/channels`) oder direkt ins erste Channel-Dashboard.
- Kanalauswahl verlinkt auf das echte Dashboard: `/dashboard/channels/:channelId`.
- Dashboard-Routen:
  - `/dashboard/channels/:channelId`
  - `/dashboard/channels/:channelId/commands`
  - `/dashboard/channels/:channelId/timers`
  - `/dashboard/channels/:channelId/community`
  - `/dashboard/channels/:channelId/recaps`
  - `/dashboard/channels/:channelId/campaigns`
  - `/dashboard/channels/:channelId/moderation`
  - `/dashboard/channels/:channelId/integrations`
  - `/dashboard/channels/:channelId/settings`
  - `/admin/health`
- Aktuell nutzbar (MVP): Dashboard-Übersicht, Commands CRUD, Timers CRUD, Campaigns CRUD, Community Radar, Recaps, Admin Health.
- Noch MVP/Platzhalter mit Erklärung: Moderation, Integrationen, Settings.

## Modern Dashboard (Frontend)

Das Dashboard ist jetzt als dunkles SaaS-UI über `/channels` erreichbar.

### Routen
- `/setup`
- `/login`
- `/channels`
- `/dashboard/channels/:channelId`
- `/dashboard/channels/:channelId/commands`
- `/dashboard/channels/:channelId/timers`
- `/dashboard/channels/:channelId/community`
- `/dashboard/channels/:channelId/recaps`
- `/dashboard/channels/:channelId/campaigns`
- `/dashboard/channels/:channelId/moderation`
- `/dashboard/channels/:channelId/integrations`
- `/dashboard/channels/:channelId/settings`
- `/admin/health`

### Nutzbar im MVP
- Commands
- Timer
- Community Radar
- Recaps
- Campaigns
- Admin Health

### Noch nicht fertig
- Discord
- Integrationen (MVP-Placeholder)
- Moderation (MVP-Placeholder)
- Settings (MVP-Placeholder)

## Production Reverse Proxy & API Security Hardening

- Public Domain: `https://www.streamforge-bot.com`
- API Domain Path: `https://www.streamforge-bot.com/api`
- Reverse Proxy routing: `/` -> frontend `192.168.58.158:4173`, `/api` -> backend `192.168.58.158:8000`.
- Backend keeps internal routes as `/api/...`.
- Required forwarded headers: `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`.
- Set backend `TRUST_PROXY=true` in proxy deployments.
- Cookie hardening: signed cookie, HttpOnly, Secure in production, SameSite=Lax (balanced CSRF protection with OAuth redirect compatibility).
- Production CORS: strict allow-list via `ALLOWED_ORIGINS` (comma-separated), credentials enabled only for allowed origins.
- Mutating requests in production require allowed `Origin` (CSRF origin check).
- API body size limit is 256KB; invalid JSON and oversized payloads return structured API errors.
- Campaign redirect `/c/:shortCode` is redirect-only (no server-side fetch), reducing SSRF exposure.

### API Inventory (Security-focused)
- Public: `/api/public/health`, `/c/:shortCode`
- Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/twitch/*`
- Setup: `/api/setup/status`, `/api/setup/create-owner`
- Channel-scoped: `/api/channels/:channelId/*` (commands/timers/campaigns/community/recaps/logs)
- Admin: `/api/admin/*`
- Validation: write endpoints reject unknown fields for key auth/setup/commands/timers/campaigns flows.

### Frontend API Base for Domainbetrieb
- Production (reverse proxy): `VITE_API_URL=https://www.streamforge-bot.com`
- Local LAN: `VITE_API_URL=http://192.168.58.158:8000`
- If `VITE_API_URL` is empty, frontend now defaults to current origin (same-domain mode).

## Twitch OAuth Callback Fehlerdiagnose

### Schnellchecks

```bash
curl -i https://www.streamforge-bot.com/api/auth/twitch/start
docker compose logs backend --tail=150
docker compose exec backend printenv | grep -E 'TWITCH|TOKEN|PUBLIC|FRONTEND|BACKEND'
```

### Häufige Fehlercodes

- `twitch.oauth.invalid_state`  
  Ursache: Cookie/Session/Domain/SameSite/Reverse-Proxy-Konfiguration verhindert konsistente OAuth-Session.
- `twitch.oauth.token_exchange_failed`  
  Ursache: Redirect URI stimmt nicht exakt mit der Twitch Developer Console überein oder Client Secret ist falsch.
- `twitch.oauth.token_encryption_failed`  
  Ursache: `TOKEN_ENCRYPTION_KEY` fehlt oder hat nicht exakt 64 Hex-Zeichen (`openssl rand -hex 32`).
- `twitch.oauth.persistence_failed`  
  Ursache: Prisma/DB/Unique-Constraint/Schema-Problem.
- `twitch.oauth.userinfo_failed`  
  Ursache: Access Token ungültig oder Twitch API Fehler.

### EventSub Hinweis

Für den ersten OAuth-Test `TWITCH_EVENTSUB_ENABLED=false` setzen. Erst nach erfolgreichem Login und gespeicherten `TwitchToken` auf `true` umstellen und Backend neu starten.
