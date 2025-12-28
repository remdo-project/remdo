# Single-Container Deployment (Caddy + Y-Sweet)

This recipe builds the RemDo SPA and bundles the Y-Sweet collab backend into one
Docker image. It assumes same-origin requests: the SPA and `/doc/*` share a
single external port.

## Build & Run

- One-step: `./docker/run.sh` builds and runs the image using `.env` in the repo
  root (copy `.env.example` and override what you need). The image tag defaults
  to `remdo` but can be set via `IMAGE_NAME`.
- Manual equivalent (override port if needed):\
  `docker build -f docker/Dockerfile --build-arg PORT=443 -t remdo .`\
  `docker run --rm --env-file .env -e DATA_DIR=/data -p 8080:8080 -v /host/data:/data remdo`

Basic auth covers both the SPA and Y-Sweet. The script:

1. Reads `BASICAUTH_USER` and `BASICAUTH_PASSWORD` from the env file (if
   `BASICAUTH_USER` is unset, it defaults to the current host username).
2. Requires the password to be non-empty and ≥10 chars.

The container exposes `PORT`; `/doc/*` and `/d*` are proxied to the collab
server on `COLLAB_SERVER_PORT`. WebSockets are forwarded automatically by
Caddy. Health check: `GET /health` returns 200 when called with the same basic
auth header.

## Data

- `DATA_DIR` in `.env` is a host path (absolute only) that `docker/run.sh` mounts
  to `/data` inside the container.
- Defaults are defined in `config/spec.ts`; `.env` is for overrides.
- `COLLAB_ORIGIN` can override the origin clients use to reach the app (for
  single-container deployments this usually matches `http(s)://HOST:PORT`).
- Y-Sweet stores docs under `/data/collab` (host: `${DATA_DIR}/collab`).
- Snapshot backups go under `/data/backup` (host: `${DATA_DIR}/backup`).
- The image sets `PATH` to include `/usr/local/bin`, so bundled tools like
  `snapshot.mjs` are available without per-script overrides.

## Notes

- The Dockerfile lives at `docker/Dockerfile`; run builds from repo root so
  `data/.vendor/lexical` is available.
- The entrypoint hashes `BASICAUTH_PASSWORD` at runtime; the plaintext password
  never touches the image or disk. For production, feed these env vars via your
  secret store (e.g., Docker/Podman secrets, Render/Heroku config vars, or a
  sealed Kubernetes secret) instead of committing them to the repo.
