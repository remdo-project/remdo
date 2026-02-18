# Environment Configuration

This document is the single source of truth for RemDo environment setup across
dev, tests, prod (host + Docker), backup machines, and CI.
Var defaults and derivations are defined in `tools/env.defaults.sh` (via
`tools/env.sh`) and are authoritative. Use `.env` only for overrides (it is
optional).

## Dev (local)

- If you need overrides, copy `.env.example` to `.env`.
- Prefer defaults; set `PORT` to avoid conflicts between workdirs on the same
  host.
- Avoid Chromium-restricted ports (like 6000); `tools/env.defaults.sh` errors if
  `PORT` or any derived port hits the blocked list. Chromium's list is the
  strictest in Playwright, so treating it as the baseline avoids surprises in
  other browsers.
- When `DATA_DIR` is relative, it resolves against the repo root.

### Worktrees (recommended for parallel option exploration)

- Name the root workdir as `remdo-BASE_PORT` (where `BASE_PORT` is the root
  `PORT` value). Example: `~/projects/remdo-7000`.
- Create worktrees as sibling directories (for example
  `~/projects/remdo-7000-wt-optA`), not nested inside the main repo. This avoids
  glob/watcher noise and accidental `git status` clutter.
- Give each worktree a unique base `PORT` in its own `.env`. All derived ports
  (including `COLLAB_SERVER_PORT`) follow from the base.
- Suggested convention: worktree `PORT = BASE_PORT + 100`, `+200`, etc., staying
  clear of Chromium’s blocked port list.
- Set a distinct `DATA_DIR` per worktree to keep artifacts inside that worktree.
- Collab reuse is guarded by a metadata file in `DATA_DIR/logs`.
  `ensureCollabServer` only reuses a running server when the metadata matches
  the current `DATA_DIR` and `COLLAB_SERVER_PORT`. If the port is already in
  use but the metadata is missing or mismatched, tests will fail with an
  actionable error—pick a new `PORT` or stop the conflicting server.

Example `.env` for a worktree:

```
HOST=127.0.0.1
PORT=7100
DATA_DIR=data-optA
```

## Tests

- Tests run through `tools/env.sh`, so derived ports follow `PORT + N` defaults.
- Override `COLLAB_ENABLED`, `PORT`, or `COLLAB_SERVER_PORT` only when needed.
- CLI tools derive collab origin from `HOST` + `COLLAB_SERVER_PORT` (browser
  uses `location.origin`).
- When running tests across multiple worktrees, keep `PORT` unique per worktree
  so collab servers and filesystem paths do not collide.

### Docker E2E (test:docker)

- Runs E2E tests against a Dockerized production build of the current repo.
- Requires a local Docker daemon (or rootless Docker) to be running.
- Uses `tools/env.sh` defaults with optional `.env` overrides; see
  `tools/docker-test.sh` for the full var list.
- Common overrides: `DATA_DIR`, `PORT` (drives `DOCKER_TEST_PORT`),
  `DOCKER_TEST_APP_HOST`, `DOCKER_TEST_TINYAUTH_APP_URL`.

## Prod

### Host OS

- `.env` lives in the repo root on the host.
- Required: `AUTH_PASSWORD`.
- Typical setup: set `AUTH_PASSWORD` and, if needed, `PORT`; leave other
  auth URL vars on defaults.
- `TINYAUTH_APP_URL` is optional.
  This is Tinyauth's configured app URL (validation/session URL) and the
  canonical browser entry host.
  Leave this unset unless you need a non-derived canonical host.
  If set manually, use the exact public URL users browse.
  Browser access must use this same host; alias hosts are not supported.
- `DATA_DIR` is the host path for persistent data.

### Self-hosted (Docker)

- `docker/run.sh` mounts host `DATA_DIR` to `/data` inside the container.
- Inside the container, the app uses `DATA_DIR=/data`.
- Y-Sweet data: `/data/collab`, backups: `/data/backup`.
- Self-hosted setups assume no external services; everything runs in the
  container.

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

- CI runs on defaults from `tools/env.sh` with no overrides.

## Local tools

- `tools/env.sh <command>` runs any command with derived env defaults.

## Document ID ownership

- Each runtime environment owns document-id resolution and must inject a
  non-empty `documentId` into the editor/session it creates.
- Browser app resolves `documentId` from route state (`/n/:docRef`) and passes
  it into the editor runtime.
- Snapshot CLI resolves `documentId` from `--doc` or `COLLAB_DOCUMENT_ID` and
  passes it into the session/editor it initializes.
- Document ID is runtime state only; it is not serialized into editor JSON.
