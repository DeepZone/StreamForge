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
