# StreamForge MVP

## Lokaler Start (ohne Docker)
1. `.env.example` nach `.env` kopieren.
2. Backend:
   - `cd backend`
   - `npm install`
   - `npx prisma generate`
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
  - Frontend: http://localhost:5173
  - Backend: http://localhost:3000
  - Postgres: localhost:5432
  - Redis: localhost:6379

## Setup-Flow (erster Admin)
- Es gibt **keinen automatischen Admin-Seed**.
- Setup ist nur erlaubt, solange kein lokaler `system_owner` existiert.
- Prüfen: `GET /api/setup/status`
- Erstellen: `POST /api/setup/create-owner`
- Nach Erfolg wird Session-Cookie gesetzt.

## Auth-Flow
- Login: `POST /api/auth/login`
- Me: `GET /api/auth/me`
- Logout: `POST /api/auth/logout`

## Prisma
- Schema: `backend/prisma/schema.prisma`
- Validierung: `npx prisma validate`
- Client-Generierung: `npx prisma generate`
- Entwicklung ohne Migrationen: `npx prisma db push`

## Typische Fehler
- `npm ERR! 403 Forbidden` beim Installieren: Registry-/Netzwerkpolicy prüfen.
- Prisma kann DB nicht erreichen: `DATABASE_URL` prüfen, Postgres-Container gestartet?
- Setup nicht mehr erlaubt: Es existiert bereits ein lokaler `system_owner`.

## Hinweis Twitch
Twitch OAuth/EventSub ist im Projekt strukturell vorbereitet, aber die vollständige produktive Anbindung folgt in einem späteren Schritt.
