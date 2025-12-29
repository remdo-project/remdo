# Environment Configuration

This document is the single source of truth for RemDo environment setup across
dev, tests, prod (host + Docker), backup machines, and CI. All runtime defaults
are derived in `tools/env.defaults.sh` (via `tools/env.sh`). Use `.env` only
for overrides.

## Dev (local)

- Copy `.env.example` to `.env`.
- Prefer defaults; set `PORT` to avoid conflicts between workdirs on the same host.
- Avoid Chromium-restricted ports (like 6000); `tools/env.defaults.sh` errors if
  `PORT` or any derived port hits the blocked list. Chromium's list is the
  strictest in Playwright, so treating it as the baseline avoids surprises in
  other browsers.
- When `DATA_DIR` is relative, it resolves against the repo root.

## Tests

- Tests run through `tools/env.sh`, so derived ports follow `PORT + N` defaults.
- Override `COLLAB_ENABLED`, `PORT`, or `COLLAB_SERVER_PORT` only when needed.
- When `NODE_ENV=test`, `COLLAB_ORIGIN` defaults to `http://${HOST}:${COLLAB_SERVER_PORT}`.

## Prod

### Host OS

- `.env` lives in the repo root on the host.
- Required: `BASICAUTH_PASSWORD`, `PORT`.
- Optional: `BASICAUTH_USER` (defaults to the current host username).
- Optional: `COLLAB_SERVER_PORT` (defaults to `PORT + 4`).
- Optional: `DATA_DIR` (defaults to `data/` under the repo root).
- `DATA_DIR` is the host path for persistent data.

### Self-hosted (Docker)

- `docker/run.sh` mounts host `DATA_DIR` to `/data` inside the container.
- Inside the container, the app uses `DATA_DIR=/data`.
- Y-Sweet data: `/data/collab`, backups: `/data/backup`.
- Self-hosted setups assume no external services; everything runs in the container.

### Cloud (Render)

- Source of truth: `render.yaml`.
- Env vars are set in Render (or via `render.yaml` defaults).
- Persistent storage is the Render disk mounted at `/data` (matches `DATA_DIR`).
- TODO: Backup workflow for hosted prod is not defined yet.

## Backup machine

- `.env` must include `PROD_HOST` (ssh target).
- `tools/make-backup.sh` assumes the prod repo path matches the local repo path.
- Backups are stored in the separate repo at `data/backup-repo` by default.

## CI

- CI runs on defaults from `tools/env.sh`, with the collaboration test job
  loading `.github/env/collab-tests.env` as its only override.

## Local tools

- `tools/env.sh <command>` runs any command with derived env defaults.
