# StreamForge MVP

## Lockfile-Strategie (npm)
- Dieses Repository nutzt npm.
- `npm install` muss lokal einmal erfolgreich laufen, damit `package-lock.json` erzeugt wird.
- Solange kein Lockfile committed ist, verwenden Dockerfiles bewusst `npm install` (nicht `npm ci`).
- Sobald `package-lock.json` committed ist, sollte CI auf `npm ci` umgestellt werden.

## Lokale Validierung
- Ausführung: `./scripts/validate-local.sh`
- Das Skript führt aus: Backend install, Prisma format/validate/generate, Backend build, Frontend install/build, optional `docker compose build`.
- Alternativ über Root-Skripte:
  - `npm run validate:backend`
  - `npm run validate:frontend`
  - `npm run validate:all`

## Lokaler Start (ohne Docker)
1. `.env.example` nach `.env` kopieren.
2. Backend:
   - `cd backend`
   - `npm install`
   - `npm run prisma:generate`
   - `npm run prisma:validate`
   - `npx prisma db push`
   - `npm run dev`
3. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`

## Docker Compose
- Build: `docker compose build`
- Start: `docker compose up`
- Services:
  - Frontend: http://localhost:4173
  - Backend: http://localhost:3000

## Minimaler cURL-Test (Cookie Session)
```bash
curl -i http://localhost:3000/api/setup/status

curl -i -X POST http://localhost:3000/api/setup/create-owner \
  -H 'content-type: application/json' \
  -c cookies.txt -b cookies.txt \
  -d '{"email":"owner@example.com","password":"StrongPass123!","displayName":"Owner"}'

curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -c cookies.txt -b cookies.txt \
  -d '{"email":"owner@example.com","password":"StrongPass123!"}'

curl -i http://localhost:3000/api/auth/me -c cookies.txt -b cookies.txt

curl -i -X POST http://localhost:3000/api/channels \
  -H 'content-type: application/json' \
  -c cookies.txt -b cookies.txt \
  -d '{"twitchChannelId":"123","twitchLogin":"demo","displayName":"Demo"}'

curl -i http://localhost:3000/api/channels -c cookies.txt -b cookies.txt
```

## Typische Fehler
- `npm ERR! 403 Forbidden`: Registry-/Netzwerkpolicy prüfen.
- Prisma DB-Fehler: `DATABASE_URL` prüfen.

## Twitch OAuth Kanal-Registrierung

### Benötigte ENV Variablen
```env
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_REDIRECT_URI=http://localhost:8000/api/auth/twitch/callback
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
TOKEN_ENCRYPTION_KEY=<genau-64-hex-zeichen>
```


### TOKEN_ENCRYPTION_KEY erzeugen
`TOKEN_ENCRYPTION_KEY` muss **genau 64 Hex-Zeichen** lang sein (32 Byte für AES-256-GCM).

Beispiel:
```bash
openssl rand -hex 32
```

### Prisma Befehle (Backend)
```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
```

### Empfohlene lokale Reihenfolge
1. `cd backend && npm install`
2. `cd backend && npm run prisma:format`
3. `cd backend && npm run prisma:validate`
4. `cd backend && npm run prisma:generate`
5. `cd backend && npm run build`
6. `cd frontend && npm install`
7. `cd frontend && npm run build`

### Twitch Developer Console
1. In der Twitch Developer Console eine Application anlegen.
2. OAuth Redirect URL auf `TWITCH_REDIRECT_URI` setzen, z. B. `http://localhost:8000/api/auth/twitch/callback`.
3. Client ID und Client Secret in die Backend-ENV übernehmen.

### OAuth Ablauf
1. Frontend ruft `GET /api/auth/twitch/start` auf.
2. Backend erzeugt `state`, speichert ihn in der Session und leitet zu Twitch um.
3. Twitch leitet zurück zu `GET /api/auth/twitch/callback` mit `code` + `state`.
4. Backend tauscht `code` gegen Token, lädt Twitch-User über Helix und erstellt/aktualisiert:
   - User (stabile Twitch User ID)
   - Channel
   - ChannelSettings
   - `!ping` Command
   - ChannelMember Rolle `channel_owner`
   - TwitchToken inkl. Scopes und ExpiresAt
5. Redirect ins Frontend auf `/dashboard/channels/:channelId`.

### Scope-Hinweise
Aktuell werden folgende Scopes angefordert: `user:read:email`, `chat:read`, `chat:edit`, `moderator:read:followers`, `channel:read:subscriptions`.
Ein Teil ist bereits für spätere Chat-/EventSub-Schritte vorbereitet.

### Sicherheit
- Twitch Access- und Refresh-Token werden verschlüsselt (AES-256-GCM) gespeichert.
- Tokens werden nicht im Klartext geloggt oder ans Frontend gesendet.

### Lokaler Testablauf
1. Backend mit gültiger Twitch-Config starten.
2. Login-Seite öffnen und **Mit Twitch anmelden** klicken.
3. Nach erfolgreichem Consent auf `/dashboard/channels/:channelId` landen.
4. `GET /api/auth/me` prüfen: User + Channel-Rollen.
5. `GET /api/channels` prüfen: nur erlaubte Channels außer für System-Admins.

## Twitch EventSub MVP (Chat Commands)
- Set `TWITCH_EVENTSUB_ENABLED=true` to start the Twitch EventSub websocket manager.
- Required OAuth scopes for this MVP are centralized in `backend/src/twitch/scopes.ts` and include: `user:read:email`, `user:read:chat`, `user:write:chat`, `channel:bot`, `user:bot`.
- After changing scopes, re-run Twitch OAuth for the channel so new scopes are granted and stored.
- MVP token model: StreamForge uses the registered channel owner token for EventSub/chat API actions. For production, a dedicated bot account per platform/instance is recommended.
- Quick test: login with Twitch, ensure channel is active + botEnabled, send `!ping` in that channel chat, verify message saved and `pong` sent back.
- Common failures: missing scopes, expired token, `TWITCH_EVENTSUB_ENABLED=false`, invalid redirect URI, websocket disconnect/reconnect.

## Twitch Session Betriebssicherheit
- StreamForge prüft vor Twitch-API-Aufrufen, ob `expiresAt` in unter 5 Minuten liegt, und führt dann automatisch einen OAuth Refresh aus.
- Refresh schreibt neue Access-/Refresh-Tokens **verschlüsselt** zurück in `TwitchToken` und aktualisiert `expiresAt` + `scopesJson`.
- Wenn der Refresh fehlschlägt, wird die Session auf `token_error` gesetzt, `lastError` befüllt und ein BotEvent `token_refresh_failed` geschrieben (ohne Secrets).
- OAuth erneut erforderlich bei `auth_required`, beschädigter Token-Entschlüsselung oder dauerhaft ungültigem Refresh-Token.

## Admin Twitch Session Controls
- `POST /api/admin/twitch/sessions/start-all`
- `POST /api/admin/twitch/sessions/stop-all`
- `POST /api/admin/twitch/sessions/:channelId/start`
- `POST /api/admin/twitch/sessions/:channelId/stop`
- `POST /api/admin/twitch/sessions/:channelId/restart`
- Erlaubt nur für `system_owner` und `platform_admin`.
- Bei `TWITCH_EVENTSUB_ENABLED=false` antworten Start-Endpunkte mit `409 eventsub_disabled`.

## Health Status Modell
Session Statuswerte: `idle`, `starting`, `connected`, `subscribed`, `reconnecting`, `stopped`, `token_error`, `error`, `auth_required`.

Admin Health enthält pro Session:
- interne `channelId`
- `twitchChannelId`, `twitchLogin`
- `status`, `connected`, `subscribed`
- `lastError`, `lastConnectedAt`, `lastMessageAt`, `lastSubscriptionAt`
- `reconnectCount`, `subscriptionsCount`

## Troubleshooting
- `token_error`: Refresh fehlgeschlagen. OAuth im Channel erneut durchführen.
- `auth_required`: Kein gültiges TwitchToken hinterlegt oder Token nicht entschlüsselbar.
- `subscription_failed`: EventSub-Subscription konnte nicht erstellt werden (Scopes/Token/Session prüfen).
- `missing scopes`: OAuth mit aktuellen Scopes erneut starten.
- `EventSub disabled`: `TWITCH_EVENTSUB_ENABLED=true` setzen oder bewusst im Disabled-Modus bleiben.
- `reconnecting`: WebSocket-Reconnect läuft; `reconnectCount` und `lastError` in Admin Health prüfen.
