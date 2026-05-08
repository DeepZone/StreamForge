# StreamForge MVP

## Lockfile-Strategie (npm)
- Dieses Repository nutzt npm.
- `npm install` muss lokal einmal erfolgreich laufen, damit `package-lock.json` erzeugt wird.
- Solange kein Lockfile committed ist, verwenden Dockerfiles bewusst `npm install` (nicht `npm ci`).
- Sobald `package-lock.json` committed ist, sollte CI auf `npm ci` umgestellt werden.

## Lokale Validierung
- Ausführung: `./scripts/validate-local.sh`
- Das Skript führt aus: Backend install, Prisma generate/validate, Backend build, Frontend install/build, optional `docker compose build`.

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
TOKEN_ENCRYPTION_KEY=<64-char-hex>
```

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
