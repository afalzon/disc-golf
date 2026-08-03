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
