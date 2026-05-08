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
