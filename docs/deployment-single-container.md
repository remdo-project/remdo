# Single-Container Deployment (Caddy + Y-Sweet)

This recipe builds the RemDo SPA and bundles the Y-Sweet collab backend into one Docker image. It assumes same-origin requests: the SPA and `/doc/*` share a single external port.

## Build

1. `./docker/build.sh` (hardcoded: `PUBLIC_PORT=8080`, tag `remdo:single`); equivalent manual command: `docker build -f docker/Dockerfile --build-arg PUBLIC_PORT=8080 -t remdo:single .`
2. Build-time env baked into the image (defaults shown):
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `PORT=${PUBLIC_PORT}` (defaults to 8080)
   - `COLLAB_ENABLED=true`
   - `COLLAB_CLIENT_PORT=${PUBLIC_PORT}` (same-origin path proxy)
   - `COLLAB_DOCUMENT_ID=main`
3. The build emits the SPA to `data/dist`; Caddy serves it from `/srv/remdo`.

## Run

1. `./docker/run.sh` (hardcoded: tag `remdo:single`, `APP_PORT=8080`, `YSWEET_PORT_INTERNAL=8081`, no volume mounts). Manual equivalent: `docker run -e APP_PORT=8080 -e YSWEET_PORT_INTERNAL=8081 -p 8080:8080 remdo:single`.
2. The container exposes only `8080`; `/doc/*` and `/d*` are proxied to Y-Sweet inside the container. WebSockets are forwarded automatically by Caddy.
3. Health check: `GET /health` returns 200.

## Data

- Y-Sweet stores docs in `/data` inside the container. With no volume attached, collaboration data is ephemeral. Mount a host volume to `/data` later if persistence is needed.

## Notes

- The Dockerfile lives at `docker/Dockerfile`; keep the build context at repo root so `data/.vendor/lexical` is available during builds.
- `docker/Caddyfile` handles SPA fallback (`/index.html`) and the `/doc/*` reverse proxy; it listens on `APP_PORT`, and CORS headers are omitted because everything is same-origin.
- If you need per-environment settings without rebuilding the image, switch to a runtime config injection approach (e.g., serve a small env JSON and have the SPA read it on startup).
