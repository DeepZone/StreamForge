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

## Dashboard Bereiche

- **LiveChat**: Zeigt Twitch-Nachrichten live per SSE, inklusive Verbindungsstatus und deduplizierter Anzeige für stabile Moderation im laufenden Stream.
- **Chatters**: Listet aktive Chat-Teilnehmer mit Rolle, Aktivitätsdaten und schnellen Rollen-/Moderationsaktionen, soweit Twitch-Scopes verfügbar sind.
- **Moderation**: Bietet aktive Bans/Timeouts, manuelle Moderationsaktionen und eine kompakte Historie als operativen Arbeitsbereich.
- **Integrationen**: Trennt klar Plattform-Bot, Channel-Moderatorstatus, EventSub-/Live-Verbindung und Debug-Hinweise zur schnellen Diagnose.
- **Admin Health**: Gibt Plattform-Admins einen strukturierten Überblick über API/DB/Redis sowie EventSub-Transporte und Session-Zustände.
- **Settings**: Zentraler Bereich für Channel-Metadaten und Bot-Grundeinstellungen wie Prefix, Sprache und Zeitzone.

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

## Twitch OAuth Callback Debugging

### Schnellchecks

```bash
docker compose logs backend --tail=200
docker compose exec backend printenv | grep -E 'TWITCH|TOKEN|PUBLIC|FRONTEND|BACKEND|COOKIE|NODE_ENV'
curl -i https://www.streamforge-bot.com/api/auth/twitch/start
```

### OAuth-State Cookie prüfen

- Browser DevTools → Application → Cookies öffnen.
- Nach `/api/auth/twitch/start` muss `sf_twitch_oauth_state` gesetzt sein.
- Callback muss auf derselben Domain erfolgen (`https://www.streamforge-bot.com`).
- In HTTPS-Setups `COOKIE_SECURE=true` setzen.
- Für den State-Cookie gilt: `HttpOnly`, `SameSite=Lax`, `Path=/api/auth/twitch`, in Production `Secure=true`.

### Häufige Fehler

- `twitch.oauth.invalid_state`
  - State-Cookie fehlt.
  - Cookie `Secure`/`SameSite`/`Path` falsch.
  - Callback läuft auf anderer Domain.
  - Reverse Proxy reicht Cookie nicht sauber durch.

- `twitch.oauth.token_exchange_failed`
  - Client Secret falsch.
  - Redirect URI stimmt nicht exakt.
  - OAuth-Code bereits verbraucht.
  - Twitch API lehnt Request ab.

- `twitch.oauth.token_encryption_failed`
  - `TOKEN_ENCRYPTION_KEY` fehlt.
  - `TOKEN_ENCRYPTION_KEY` ist nicht 64 Hex-Zeichen.
  - Lösung: `openssl rand -hex 32`.

- `twitch.oauth.persistence_failed`
  - Prisma Schema/DB Problem.
  - Unique Constraint.
  - Ungültiges Datenformat.


### EventSub startet nur echte Twitch-Channels

`startAll()` startet ausschließlich echte Streamer-Channels, wenn alle Bedingungen erfüllt sind:
- `isActive=true`
- `botEnabled=true`
- gespeicherter TwitchToken vorhanden
- kein interner System-Channel (`displayName=System`, `twitchLogin=system-*`, `twitchChannelId=sys-*`)

Wichtig:
- Der System-Channel wird nie für Twitch EventSub subscribed.
- Channels ohne TwitchToken werden als `skipped` markiert (z. B. `missing_twitch_token`) und nicht als harter Fehler gezählt.
- Der Plattform-Bot ist ein globaler Bot-Account und wird nicht automatisch als aktiver Streamer-Channel behandelt.

### EventSub Hinweis

Für OAuth-Tests `TWITCH_EVENTSUB_ENABLED=false` setzen.
Erst nach erfolgreichem OAuth-Login und gespeicherten Tokens auf `true` setzen und Backend neu starten.

## Twitch OAuth Production (Reverse Proxy)

Pflichtwerte für Production:
- `PUBLIC_APP_URL=https://www.streamforge-bot.com`
- `PUBLIC_API_URL=https://www.streamforge-bot.com/api`
- `FRONTEND_URL=https://www.streamforge-bot.com`
- `BACKEND_URL=https://www.streamforge-bot.com`
- `TWITCH_REDIRECT_URI=https://www.streamforge-bot.com/api/auth/twitch/callback`

Twitch Developer Console Redirect URLs müssen **exakt** sein:
- `https://www.streamforge-bot.com/api/auth/twitch/callback`
- `https://www.streamforge-bot.com/api/auth/twitch/platform-bot/callback`

Typisch falsch:
- `http://192.168.58.158:8000/api/auth/twitch/callback`
- `http://192.168.58.158:4173/login`
- `https://streamforge-bot.com/api/auth/twitch/callback`
- `https://www.streamforge-bot.com/auth/twitch/callback`
- `https://www.streamforge-bot.com/api/auth/twitch/callback/`

Nginx/NPM Proxy:
- `/api` -> `http://192.168.58.158:8000`
- `/` -> `http://192.168.58.158:4173`
- Forwarded Header: `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`

Diagnose:
```bash
curl -i https://www.streamforge-bot.com/api/public/health
curl -i https://www.streamforge-bot.com/api/public/twitch/config
curl -i https://www.streamforge-bot.com/api/public/twitch/oauth-url
curl -I https://www.streamforge-bot.com/api/auth/twitch/start
```

Erwartung:
- `/api/public/health` -> `200` JSON
- `/api/public/twitch/config` -> sichere Config-Diagnose
- `/api/public/twitch/oauth-url` -> OAuth URL mit korrekter `redirect_uri`
- `/api/auth/twitch/start` -> `302` zu `https://id.twitch.tv/oauth2/authorize...`
- niemals Redirect zu `http://192.168.58.158:4173/login`

Scopes (MVP):
- `user:read:email`
- `user:read:chat`
- `user:write:chat`
- `user:bot`
- `channel:bot`

Bei Scope-Änderungen muss OAuth erneut durchgeführt werden.


## Aktueller MVP Stand

Funktioniert:
- Login
- Twitch OAuth
- EventSub
- Commands
- Custom Commands

Nutzbar im Dashboard:
- Commands
- Timer (Verwaltung im Dashboard; Ausführung aktuell MVP/experimentell solange Timer-Worker nicht produktiv angeschlossen ist)
- Logs
- Admin Health

Testablauf:
1. Twitch Login
2. EventSub aktivieren
3. !ping testen
4. Custom Command im Dashboard anlegen
5. Im Twitch Chat testen
6. Usage Count prüfen
7. Logs prüfen

## Community Intelligence MVP

StreamForge enthält nun ein kanalgebundenes Community-Intelligence-MVP auf Basis lokal gespeicherter Twitch-Chatdaten:
- Community Radar mit Nachrichten, aktiven Chattern, neuen/wiederkehrenden Zuschauern, Topics, FAQ-Anteilen, Command-Nutzung und heuristischem Engagement-Score.
- FAQ-Erkennung mit Normalisierung und Gruppierung ähnlicher Fragen.
- Command-Vorschläge inkl. Erstellung eines Commands direkt aus dem Vorschlag.
- Stream Recaps als lokal erzeugte Zusammenfassung ohne externe KI.

Wichtig:
- Alle Auswertungen sind heuristisch und lokal.
- Keine externe KI/API.
- Keine automatische Moderation oder Sanktionen.
- Keine personenbezogene Diagnose.

### Testablauf
1. Im Twitch Chat mehrere Nachrichten schreiben.
2. Fragen stellen, z. B. „Welches Mikro nutzt du?“.
3. Dashboard → Community Radar öffnen.
4. Command-Vorschlag prüfen.
5. Command daraus erstellen.
6. Im Twitch Chat testen.
7. Recap generieren.

## Produktiver Twitch-MVP Test

1. Admin Login.
2. Twitch Login.
3. EventSub aktivieren.
4. `!ping` testen.
5. Custom Command anlegen.
6. Timer anlegen.
7. Logs prüfen.
8. Community Radar prüfen.
9. Recap generieren.

## Bekannte MVP-Grenzen

- Discord ist noch nicht aktiv.
- Recaps sind heuristisch.
- Community Radar ist heuristisch.
- Keine automatische Moderation.
- Timer sind abhängig von Worker/Backend-Laufzeit.

## Neue Twitch-Chat Features

- Live Chat im Dashboard (`/dashboard/channels/:channelId/live-chat`)
- Aktuelle Chatters im Dashboard (`/dashboard/channels/:channelId/chatters`)
- Chatters werden mit CommunityUser-Daten (firstSeen/lastSeen/messageCount/commandCount) angereichert
- Chatters-Liste kann bei Twitch verzögert aktualisiert werden
- Neuer benötigter Scope: `moderator:read:chatters`
- Nach Scope-Änderung muss Twitch OAuth erneut durchgeführt werden, damit das Token den Scope enthält

### Testablauf (Live Chat + Chatters)
1. Twitch neu verbinden.
2. EventSub aktivieren.
3. Im Twitch Chat Nachrichten schreiben.
4. Dashboard → Live Chat öffnen.
5. Dashboard → Chatters öffnen.
6. Prüfen, ob Chatters angezeigt werden.

## Als separater Bot-Name im Twitch Chat senden

Twitch zeigt immer den Namen des Accounts an, dessen OAuth-Token zum Senden genutzt wird.
Wenn ein anderer Name im Chat erscheinen soll, muss ein separater Twitch-Bot-Account verbunden werden.

- Der Kanal sollte den Bot-Account als Moderator setzen: `/mod BOTNAME`.
- Danach in StreamForge: `Dashboard -> Integrationen -> Twitch Bot Account verbinden`.
- Bei Twitch mit dem gewünschten Bot-Account anmelden.
- Danach sendet StreamForge im Chat als Bot-Account.
- Ohne verbundenen Bot-Account sendet StreamForge weiterhin als Broadcaster.

### Scope-Hinweis

Nach Scope-Änderungen muss Twitch OAuth erneut durchgeführt werden (Broadcaster- und/oder Bot-Flow).

## Zentraler Plattform-Bot

StreamForge verwendet einen zentralen Twitch-Bot-Account zum Senden von Chatnachrichten.

- Broadcaster OAuth (pro Channel) bleibt für Channel-Verknüpfung, EventSub und Berechtigungsprüfung erforderlich.
- Platform Bot OAuth (global) wird einmal im Adminbereich verbunden.
- Streamer müssen den Plattform-Bot im eigenen Chat moderieren: `/mod BOTLOGIN`.
- Ohne Plattform-Bot oder ohne Modrechte kann Senden fehlschlagen.
- Nach Scope-Änderungen muss OAuth erneut durchgeführt werden.

### Twitch Developer Console Redirect URLs (Production)

Diese Redirect URLs müssen **exakt** eingetragen sein:

- Broadcaster OAuth: `https://www.streamforge-bot.com/api/auth/twitch/callback`
- Platform Bot OAuth: `https://www.streamforge-bot.com/api/auth/twitch/platform-bot/callback`

### Testablauf

1. Admin Login.
2. Plattform-Bot verbinden.
3. Redirect URL für Platform Bot Callback in Twitch Developer Console prüfen.
4. Streamer Channel verbinden.
5. In Twitch Chat: `/mod BOTLOGIN`.
6. In StreamForge Moderatorstatus prüfen.
7. Command anlegen.
8. Im Twitch Chat ausführen.
9. Bot antwortet unter BOTLOGIN.

## Twitch Moderation
- Unterstützte Aktionen: Timeout, Ban, Unban/Untimeout über Dashboard und API.
- Benötigter Broadcaster Scope: `moderator:manage:banned_users`.
- Nach Scope-Änderungen muss Twitch OAuth erneut durchgeführt werden, damit der Scope im gespeicherten Token vorliegt.
- Alle Moderationsaktionen sind manuell ausgelöst, kanalgebunden, rollenbasiert und werden in ModerationAction/BotEvent/AuditLog protokolliert.
- Keine automatische Moderation, keine automatischen Sanktionen.

## Recaps löschen
- API: `DELETE /api/channels/:channelId/recaps/:recapId`.
- Löschen ist kanalgebunden und nur für berechtigte Rollen vorgesehen.
- Löschaktionen werden auditiert.

## Community Radar Aufräumung
- Topics werden heuristisch zu Clustern verdichtet (z. B. Setup, Discord, Schedule, Music, Gaming, Tech).
- Irrelevante Einzelwörter, URLs, Mentions, Zahlenfragmente und sehr kurze Tokens werden gefiltert.
- Anzeige nur relevanter Topics inkl. Score/Keywords/MessageCount, keine rohe Wortzähl-Liste.
- Empfehlungen sind kompakt (max. 5) und rein heuristisch, ohne personenbezogene Bewertung.

## Twitch Chatters und Rollenverwaltung

- Chatters zeigt aktuelle Twitch-Chatteilnehmer im Dashboard.
- Twitch aktualisiert diese Liste verzögert.
- Angezeigte Rollen: Broadcaster, Moderator, VIP, Viewer.
- Über StreamForge änderbar sind nur echte Twitch-Rollen:
  - Moderator hinzufügen/entfernen
  - VIP hinzufügen/entfernen
- Nicht änderbar: Subscriber, Follower, Founder, Broadcaster, Affiliate/Partner.
- Benötigte Scopes:
  - moderator:read:chatters
  - channel:manage:moderators
  - channel:read:vips
  - channel:manage:vips
- Nach Scope-Änderung muss Twitch OAuth erneut durchgeführt werden.
- Alle Rollenänderungen werden in AuditLog/BotEvent/TwitchRoleAction protokolliert.

## Chatters (Rollen & Moderation)

Die Seite **Chatters** zeigt aktuelle Twitch-Chatteilnehmer (mit möglicher Twitch-Verzögerung) und deren Rolle:
- Broadcaster
- Moderator
- VIP
- Viewer

Pro Chatter gibt es ein **Hamburger-/Drei-Punkte-Menü** mit manuellen Aktionen:
- Moderator hinzufügen/entfernen
- VIP hinzufügen/entfernen
- Timeout
- Ban
- Unban / Timeout entfernen

Nicht möglich über StreamForge:
- Subscriber setzen
- Follower setzen
- Broadcaster ändern
- Affiliate/Partner ändern

Benötigte Scopes:
- `moderator:read:chatters`
- `channel:manage:moderators`
- `channel:read:vips`
- `channel:manage:vips`
- `moderator:manage:banned_users`

Wichtig: Nach Scope-Änderungen muss Twitch OAuth erneut durchgeführt werden, damit der gespeicherte Token die neuen Scopes enthält.

Alle Rollen- und Moderationsaktionen werden in Audit- und Event-Logs protokolliert.

## Globaler Plattform-Bot

- Der Plattform-Bot ist ein zentraler Twitch-Account des Betreibers.
- Er wird einmalig im Adminbereich unter `/admin/twitch` per OAuth verbunden.
- Streamer verbinden nur ihren eigenen Channel per Broadcaster OAuth.
- Um den Plattform-Bot im Channel zu aktivieren, muss der Streamer im Twitch-Chat ausführen: `/mod BOTLOGIN`.
- Channel-Integrationen zeigen nur Status und Anleitung, kein Admin-OAuth für normale Channel-User.
- Nur Admins (`system_owner`, `platform_admin`) können den globalen Plattform-Bot verbinden.
- Optionaler Fallback: `TWITCH_ALLOW_BROADCASTER_SEND_FALLBACK` (empfohlen: development `true`, production `false`).

## Plattform-Bot in Channel holen

- Der globale Plattform-Bot gehört zur Plattform und wird zentral vom Betreiber verbunden.
- Streamer verbinden nur ihren eigenen Twitch-Channel per Broadcaster OAuth.
- Danach kann der Bot in den Channel geholt werden:
  1. Automatisch über StreamForge, wenn der Broadcaster-Token den Scope `channel:manage:moderators` hat.
  2. Manuell im Twitch-Chat mit `/mod BOTLOGIN`.
- Danach in der Integrationsseite auf **Status prüfen** bzw. **Status erneut prüfen** klicken.
- Wenn der Scope fehlt: Twitch-Kanal erneut verbinden, damit der Token `channel:manage:moderators` enthält.

## Channel Settings

Unter `/dashboard/channels/:channelId/settings`:
- `botEnabled`
- `commandPrefix`
- `language` (`de`/`en`)
- `timezone`


## Plattform-Bot Moderatorstatus prüfen

Ablauf:
1. Plattform-Bot global im Adminbereich verbinden.
2. Streamer-Channel per Twitch OAuth verbinden.
3. Im Twitch-Chat ausführen: `/mod BOTLOGIN`.
4. In StreamForge unter Integrationen: **Moderatorstatus prüfen**.

Fehlerdiagnose:
- `twitch.platform_bot.scope_missing`: Channel erneut per Twitch verbinden.
- `twitch.platform_bot.channel_token_missing`: Streamer muss Twitch OAuth durchführen.
- `twitch.platform_bot.not_configured`: Betreiber muss Plattform-Bot verbinden.
- `twitch.platform_bot.api_failed`: Twitch API Antwort und Request-ID in Logs prüfen.

## Plattform-Bot Status

- Ein vorhandener Plattform-Bot bedeutet **nicht**, dass er im Channel bereits als Moderator eingerichtet ist.
- Der Moderatorstatus muss live über Twitch geprüft werden.
- Nur `verified_moderator` bedeutet "bereit".
- Bei `unknown`, `scope_missing`, `api_failed` oder `check_failed` darf StreamForge nicht als "bereit" anzeigen.

## Fehlerdiagnose Twitch Livechat

Wenn neue Chatnachrichten nicht erscheinen:

1. Admin Health prüfen.
2. Channel Debug prüfen: `GET /api/channels/:channelId/twitch/debug`
3. Folgendes kontrollieren:
   - EventSub enabled
   - Session connected
   - subscribed
   - lastMessageAt
   - ChatMessages gespeichert
   - Live-Stream/SSE verbunden

Wenn `scope_missing` angezeigt wird, Twitch-Kanal erneut verbinden, damit `channel:manage:moderators` im Broadcaster-Token enthalten ist.

## Twitch MVP Status (Operations)

- Twitch OAuth, Livechat, Chatters, Moderation, Integrationen und Settings sind im MVP nutzbar.
- Debug-Daten pro Channel: `GET /api/channels/:channelId/twitch/debug` (ohne Token/Secret-Werte).
- Debug UI: im Bereich Integrationen sichtbar (EventSub, letzte Nachrichten, Live-Subscriber, Bot-Status).
- Livechat prüfen: `/dashboard/channels/:channelId/livechat` öffnen, SSE-Status beobachten und Historie neu laden.
- Plattform-Bot prüfen: in Integrationen `Moderatorstatus prüfen` ausführen.
- Nach Scope-Änderungen muss Twitch OAuth neu verbunden werden (z. B. `moderator:manage:banned_users`, `channel:manage:moderators`, `channel:manage:vips`, `channel:read:vips`).

## EventSub Recovery Test

1. Backend starten.
2. AdminHealth prüfen:
   - `eventSubConnected=true`
   - Channel `subscribed=true`
3. Im Twitch Chat schreiben: `test`
4. Erwartung in BotEvents:
   - `eventsub_chat_message_received`
   - `chat_message_saved`
   - `live_chat_event_published`
5. Backend restart: `docker compose restart backend`
6. Nach Restart: AdminHealth muss wieder `subscribed=true` zeigen.
7. Wieder im Twitch Chat schreiben.
8. Livechat muss aktualisieren.
9. Command `!ping` (oder Channel-Prefix) testen.

## Twitch EventSub WebSocket User-Kontext

Twitch erlaubt auf einer einzelnen EventSub-WebSocket-Session keine Subscriptions, die mit unterschiedlichen User-Kontexten erstellt werden.

Darum nutzt StreamForge pro Broadcaster/User-Kontext eine eigene EventSub-WebSocket-Verbindung (Transport-Isolation pro User-ID).

Der Plattform-Bot wird dabei nicht als normaler Channel subscribed. Der Plattform-Bot ist Sender/Moderator und wird nicht automatisch als beobachteter Channel gestartet.

## EventSub Fehler: maximum subscriptions with type and condition exceeded

Ursache:
- Bei Twitch existieren noch alte oder doppelte EventSub-Subscriptions für denselben Typ und dieselbe Bedingung.
- Betroffen ist meist `channel.chat.message` bei Reconnects/duplizierten Sessions.

Lösung:
1. In **Admin Health** die Aktion **Cleanup EventSub Subscriptions** ausführen.
2. Danach **Restart EventSub** oder pro Session **Restart Session** ausführen.

Sicherheitsgrenze:
- StreamForge löscht nur passende **WebSocket**-Subscriptions für denselben Channel/User-Kontext (`broadcaster_user_id` + `user_id`) und nur für `channel.chat.message`.
- Fremde Subscription-Typen oder fremde Channel/User-Kontexte werden nicht gelöscht.


## ChatMessage-Dedupe Cleanup (vor `prisma db push`)

Falls bereits doppelte Twitch-Chatnachrichten vorhanden sind, vor Schema-Update ausführen:

```sql
delete from "ChatMessage" c
using "ChatMessage" d
where c."channelId" = d."channelId"
  and c.platform = d.platform
  and c."externalMessageId" = d."externalMessageId"
  and c."externalMessageId" is not null
  and c."createdAt" > d."createdAt";
```

Danach `prisma db push` ausführen, damit der Unique Constraint sauber greift.

## LiveChat senden als Streamer

- Manuelle Nachrichten aus dem Dashboard-LiveChat werden immer als Broadcaster/Streamer gesendet (nicht als Plattform-Bot).
- Bot-/Command-Antworten laufen weiterhin unverändert über die bestehende Plattform-Bot-Logik.
- Benötigter Broadcaster-Scope: `user:write:chat`.
- Nach Scope-Änderung muss der Twitch-Kanal erneut verbunden werden, damit das Token den neuen Scope enthält.
- Erfolgreich gesendete Nachrichten werden nicht lokal „gefaked“, sondern erscheinen erst nach Twitch EventSub-Zustellung im LiveChat (vermeidet Duplikate).

## LiveChat Darstellung

- Viewernamen werden farblich unterschiedlich dargestellt.
- Der Nachrichtentext bleibt einheitlich (gleiche Textfarbe für alle Nachrichten).

## LiveChat SSE hinter Reverse Proxy (Nginx/NPM)

Damit LiveChat-Events ohne Reload sofort erscheinen, muss SSE für `/api/channels/:channelId/live/chat/stream` ungepuffert durchgereicht werden.

Empfohlene Proxy-Settings für `/api`:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
chunked_transfer_encoding off;
```

Zusätzlich sollte der Backend-Response-Header gesetzt sein:

```http
X-Accel-Buffering: no
```

Hinweis zur Diagnose: Wenn LiveChat dauerhaft `reconnecting` zeigt und `liveStream.subscribers=0` bleibt, blockiert typischerweise Auth, Route oder Reverse Proxy die SSE-Verbindung.

## Smoke Test

Das lokale Smoke-Script liegt unter `scripts/smoke-test-local.sh`.

ENV-Variablen:
- `BASE_URL` (Default: `https://www.streamforge-bot.com`)
- `EMAIL` und `PASSWORD` (optional für Login)
- `CHANNEL_ID` (optional für Channel-spezifische Endpunkte)

Beispiel:

```bash
BASE_URL=https://www.streamforge-bot.com EMAIL=owner@example.test PASSWORD='***' CHANNEL_ID=abc123 bash scripts/smoke-test-local.sh
```

## Backend Route Struktur

- `backend/src/routes/channels.routes.ts`: Channel-Liste, Channel-Anlage, Channel-Detail.
- `backend/src/routes/channelSettings.routes.ts`: Channel Settings lesen/schreiben.
- `backend/src/routes/channelLogs.routes.ts`: Channel Logs.
- `backend/src/routes/liveChat.routes.ts`: Chat-History, SSE-Stream, manuelles Senden.
- `backend/src/routes/chatters.routes.ts`: Twitch Chatters.
- `backend/src/routes/twitchRoles.routes.ts`: Twitch Rollen-Aktionen + Historie.
- `backend/src/routes/twitchModeration.routes.ts`: Twitch Moderationsaktionen.
- `backend/src/routes/platformBot.routes.ts`: Plattform-Bot Status/Checks.
- `backend/src/routes/channelDebug.routes.ts`: Twitch Debug-Endpoint.
