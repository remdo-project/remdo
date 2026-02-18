# Environment Configuration

This document is the single source of truth for RemDo environment setup across
dev, tests, prod (host + Docker), backup machines, and CI.
Var defaults and derivations are defined in `tools/env.defaults.sh` (via
`tools/env.sh`) and are authoritative. Use `.env` only for overrides (it is
optional).

## Dev (local)

- If you need overrides, copy `.env.example` to `.env`.

## Tests

- Test env resolution runs through `tools/env.sh`.
- For override behavior, use script docs/source (`tools/env.defaults.sh`,
  `tools/docker-test.sh`).

### Docker E2E (test:docker)

- Runs E2E tests against a Dockerized production build of the current repo.
- Requires a local Docker daemon (or rootless Docker) to be running.
- Source of truth for Docker E2E env handling is `tools/docker-test.sh`.

## Prod

### Host OS

- `.env` lives in the repo root on the host.
- Required: `AUTH_PASSWORD`.
- Typical setup: set `AUTH_PASSWORD` and optionally `PORT`, then keep other
  vars on defaults.
- If you override `TINYAUTH_APP_URL`, browser access must use the same host.
- `DATA_DIR` is the host path for persisted runtime data.

### Self-hosted (single-container Docker)

- Use `./docker/run.sh` for build/run orchestration (authoritative defaults and
  `.env` handling).
- Routing/auth behavior source of truth: `docker/Caddyfile`.
- Runtime process wiring and on-container data layout source of truth:
  `docker/entrypoint.sh` and `docker/backup.sh`.
- This mode assumes single-container, single external port deployment.

### Cloud (Render)

- Source of truth: `render.yaml` (service shape, env defaults, and disk mount).
- TODO: Backup workflow for hosted prod is not defined yet.

## Backup machine

- Source of truth: `tools/make-backup.sh` (including required `PROD_DATA_ADDR`
  format and local backup repo assumptions).

## CI

- CI runs on defaults from `tools/env.sh` with no overrides.

## Local tools

- `tools/env.sh <command>` runs any command with derived env defaults.

## Document ID ownership

Document-id ownership rules are defined in
`docs/outliner/note-ids.md#runtime-document-id-ownership`.
