# StreamForge
Mandantenfähige Twitch-/Discord-Bot-Plattform (MVP) mit Fastify, Prisma, React und Docker Compose.

## Features
- Multi-Tenant über `Channel` + `ChannelMember` Rollenmodell.
- Setup-Assistent für ersten `system_owner`.
- Lokaler Login (E-Mail/Passwort) und vorbereitete Twitch OAuth-Architektur.
- Kanal-Scopes für Commands, Timer, Campaigns, Logs, Community, Recaps.
- Kampagnen-Shortlinks (`/c/:shortCode`) mit Click-Tracking und IP-Hashing.

## Start
1. `.env.example` nach `.env` kopieren und Werte setzen.
2. `docker compose up --build`
3. Backend: `http://localhost:3000`, Frontend: `http://localhost:5173`

## Wichtige ENV
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`, `FRONTEND_URL`, `BACKEND_URL`.

## Prisma
Im Backend-Container wird beim Start `prisma db push` ausgeführt.

## Setup erster Admin
- Öffne Frontend `/setup`.
- Backend prüft serverseitig über `GET /api/setup/status`.
- `POST /api/setup/create-owner` funktioniert nur einmalig.

## Twitch
Für echten OAuth/Helix/EventSub sind gültige Twitch App Credentials nötig. Struktur ist vorbereitet, produktive Adapter können in `backend/src/twitch/*` erweitert werden.

## Security
- Passwörter via Argon2 gehasht.
- Kampagnen-IP wird gehasht gespeichert.
- Keine Secrets hardcoded.
