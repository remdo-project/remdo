# Single-Container Deployment (Caddy + Y-Sweet)

This recipe builds the RemDo SPA and bundles the Y-Sweet collab backend into one Docker image. It assumes same-origin requests: the SPA and `/doc/*` share a single external port.

## Build

1. `docker build -t remdo:single .`
2. Build-time env baked into the image (adjustable via `--build-arg PUBLIC_PORT=443` when needed):
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `PORT=${PUBLIC_PORT}` (defaults to 8080)
   - `COLLAB_ENABLED=true`
   - `COLLAB_CLIENT_PORT=${PUBLIC_PORT}` (same-origin path proxy)
   - `COLLAB_DOCUMENT_ID=main`
3. The build emits the SPA to `data/dist`; Caddy serves it from `/srv/remdo`.

## Run

1. `docker run -e APP_PORT=8080 -p 8080:8080 remdo:single`
2. Runtime envs (defaults set in the image):
   - `YSWEET_PORT_INTERNAL` (default `8081`, internal only)
   - `APP_PORT` (default `8080`), controls the Caddy listen port; set to your platform’s `$PORT` (e.g., Render) and publish accordingly.
3. The container exposes only `8080`; `/doc/*` is proxied to Y-Sweet inside the container. WebSockets are forwarded automatically by Caddy.
4. Health check: `GET /health` returns 200.

## Data

- Y-Sweet stores docs in `/data` inside the container. With no volume attached, collaboration data is ephemeral. Mount a host volume to `/data` later if persistence is needed.

## Notes

- `docker/Caddyfile` handles SPA fallback (`/index.html`) and the `/doc/*` reverse proxy; it listens on `APP_PORT`, and CORS headers are omitted because everything is same-origin.
- If you need per-environment settings without rebuilding the image, switch to a runtime config injection approach (e.g., serve a small env JSON and have the SPA read it on startup).
