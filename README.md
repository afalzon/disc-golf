# Disc Golf Navigator

Offline-ready disc golf course app with map navigation, QR entry, GPS distance/bearing, and server-backed course/round sync.

## Stack

- React + TypeScript + Vite
- PWA with Workbox via `vite-plugin-pwa`
- Leaflet via `react-leaflet`
- Backend API with SQLite persistence
- Local synchronized cache with IndexedDB (`idb`) for patchy mobile coverage

## Current MVP Features

- Course map page at `/course/:courseId`
- Hole navigation with distance + compass bearing to basket
- Install app button (PWA `beforeinstallprompt` flow)
- Enable Offline button that pre-caches nearby map tiles
- QR scanner dialog (opens in-app routes from matching origin)
- Admin portal at `/admin-portal` with editor route at `/admin/:courseId`
- Drag tee/pin markers and draw walking paths
- Save edits to backend API and mirror locally for offline fallback

## Run

```bash
npm install
npm run dev
```

`npm run dev` now starts both the Vite frontend and the local API server.

PWA install behavior:

- Production builds enable PWA install/offline support by default.
- Local dev keeps PWA disabled unless you explicitly set `VITE_ENABLE_PWA=true`.
- You can force-disable in production with `VITE_ENABLE_PWA=false` at build time.

Build and quality checks:

```bash
npm run lint
npm run build
```

## Container Deployment

Build the production image:

```bash
docker build -t disc-golf:latest .
```

Run the container:

```bash
docker run --rm -p 8080:8080 --name disc-golf disc-golf:latest
```

Or run with Compose:

```bash
docker compose up --build -d
```

Compose persistence note:

- The SQLite file is persisted in the named volume `disc-golf-data`.
- Rebuild/restart keeps data (`docker compose up --build -d`).
- Data is removed only if you remove the volume (for example `docker compose down -v` or `docker volume rm`).

Public URL note:

- Set `PUBLIC_BASE_URL` when you want generated QR/share links to use a fixed hostname.
- Example: `PUBLIC_BASE_URL=https://golf.yourit.online`
- If unset, the app uses the current browser origin.

Then open http://localhost:8080.

## Admin Auth + SMTP

Admin write actions now require a global-admin magic-link session.

Set these environment variables (in `.env` for local dev or your runtime env):

- `GLOBAL_ADMIN_EMAIL` (required for admin login)
- `SMTP_HOST`
- `SMTP_PORT` (for example `587`)
- `SMTP_SECURE` (`true` for implicit TLS, usually `false` for STARTTLS on 587)
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM` (sender address)
- `SMTP_REPLY_TO` (optional)
- `AUTH_MAGIC_LINK_TTL_MINUTES` (optional, default `15`)
- `AUTH_SESSION_TTL_HOURS` (optional, default `12`)

Flow:

1. Open `/admin-login`.
2. Enter `GLOBAL_ADMIN_EMAIL`.
3. Click the magic link in email.
4. Configure/test SMTP in Admin Portal if needed.

SMTP settings can be edited in the Admin Portal and are stored in SQLite, but env values override stored settings at runtime.

Container files:

- Docker image build: `Dockerfile`
- Nginx runtime config: `docker/nginx.conf`
- Compose service: `docker-compose.yml`
- Docker build context excludes: `.dockerignore`

## Data Model

See course types in `src/types/course.ts` and round types in `src/types/round.ts`.

The backend stores courses/rounds/default-course in SQLite (`data/app-db.sqlite`).
The frontend mirrors data into local IndexedDB as a synchronized fallback cache.

Local dev note:

- `npm run dev` stores SQLite in the repo-local `data/` folder by default.
- Docker Compose stores SQLite in the `disc-golf-data` volume.

Round updates use optimistic concurrency with a `revision` field. Score updates also include per-entry timestamps to reduce overwrite conflicts between multiple scorers.

## Notes

- Tile caching currently targets OpenStreetMap tiles around course center and nearby zoom levels.
- For private custom map packs, the next step is swapping tile strategy to PMTiles or static overlay bundles.
- QR deep-linking is route-based, so course QR codes can point directly to URLs like `/course/demo-course?hole=1`.
