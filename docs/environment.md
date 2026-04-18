# Environment Configuration

This doc covers environment requirements for the current implementation.
Defaults and derivations live in `tools/env.defaults.sh` and are authoritative.
Use `.env` only for overrides.

Durable deployment goals live in [docs/principles.md](./principles.md). This
doc describes the active runtime shape, not a permanent commitment to specific
vendors or packaging.

## Dev (local)

- If you need overrides, copy `.env.example` to `.env`.
- Most local runs can keep all env vars on defaults.

## Tests

- Test commands resolve env through `tools/env.sh`.
- Docker prod E2E uses `tools/docker-test.sh`.
- Docker prod E2E requires a local Docker daemon.

## Prod

### Host OS

- Use a repo-root `.env`.
- Required: `AUTH_PASSWORD`.
- Optional: `PORT`.
- If you override `TINYAUTH_APP_URL`, browser access must use that same host.
- Runtime data is stored at `<repoRoot>/data`.

### Self-hosted Docker

- Use `./docker/run.sh`.
- Requires a local rootless Docker daemon.
- Rootful Docker is not supported by the local launcher.
- Required: `AUTH_PASSWORD` in `.env`.
- Optional: `PORT`.
- The script prints the browser URL before starting the container; use that URL.
- Local Docker uses self-signed HTTPS by default, so browsers will warn until
  you trust the local CA.
- Runtime data is stored in the repo `data/` directory.
- If `data/` was created by older rootful runs, reclaim it once with `chown`
  before the first rootless start.

### Cloud (Render)

- Source of truth: `render.yaml`.
- Required in the Render Dashboard: `AUTH_PASSWORD` and `TINYAUTH_APP_URL`.
- `AUTH_USER` is fixed to `remdo` in the Blueprint.
- The service listens on `:${PORT}` and Render terminates public HTTPS.
- Preview or staging services must set `TINYAUTH_APP_URL` manually.
- TODO: backup workflow for hosted prod is not defined yet.

## Backup machine

- Source of truth: `tools/remote/make-backup.sh`.

## CI

- CI uses defaults from `tools/env.sh` with no overrides.

## Local tools

- `tools/env.sh <command>` runs a command with derived env defaults.

## Document ID ownership

Document-id ownership rules are defined in
`docs/outliner/note-ids.md#runtime-document-id-ownership`.
