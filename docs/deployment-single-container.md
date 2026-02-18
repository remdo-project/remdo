# Single-Container Deployment (Caddy + Y-Sweet + Tinyauth)

This recipe builds the RemDo SPA and bundles Y-Sweet plus Tinyauth into one
Docker image. It assumes a single external port.

## Build & Run

- One-step: `./docker/run.sh` builds and runs the image using `.env` overrides
  when present (copy `.env.example` and override what you need). The image tag
  defaults to `remdo` but can be set via `IMAGE_NAME`.

Environment usage is documented in `docs/environment.md`.
Authoritative defaults and derivations are defined in `tools/env.defaults.sh`.

Tinyauth protects both the SPA and Y-Sweet through Caddy `forward_auth`.
`AUTH_USER` and `AUTH_PASSWORD` are used at startup to generate a
runtime bcrypt user record in memory.
For most deployments, set `AUTH_PASSWORD` and optionally `PORT`, then keep
the derived auth URL defaults.

Auth routing is single-mode and same-host:

- The app and Tinyauth share the same external host and port.
- Browser access must use the same host configured in `TINYAUTH_APP_URL`.
- Caddy routes auth UI/API paths (`/login`, `/logout`, `/api/user/*`,
  `/api/auth/*`, `/resources/*`, `/assets/*`, etc.) to Tinyauth.
- All other app routes stay on the SPA/Y-Sweet path behind `forward_auth`.

Leave `TINYAUTH_APP_URL` and `PUBLIC_BASE_DOMAIN` unset unless you need
explicit host overrides.

The container exposes `PORT`; `/doc/*` and `/d*` are proxied to the collab
server on `COLLAB_SERVER_PORT`. WebSockets are forwarded automatically by
Caddy. Health check: `GET /health` returns 200 without authentication.

## Data

- `docker/run.sh` mounts the host data directory to `/data` inside the
  container.
- Y-Sweet stores docs under `/data/collab` (host: `${DATA_DIR}/collab`).
- Tinyauth stores state under `/data/tinyauth` (host: `${DATA_DIR}/tinyauth`).
- Snapshot backups go under `/data/backup` (host: `${DATA_DIR}/backup`).
- The image sets `PATH` to include `/usr/local/bin`, so bundled tools like
  `snapshot.mjs` are available without per-script overrides.

## Notes

- The Dockerfile lives at `docker/Dockerfile`; run builds from repo root so
  `data/.vendor/lexical` is available.
