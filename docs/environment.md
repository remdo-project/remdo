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

### Docker E2E (test:e2e:prod)

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
- Runtime data is always stored at `<repoRoot>/data` (derived from
  `REMDO_ROOT`).

### Self-hosted (single-container Docker)

- Use `./docker/run.sh` for build/run orchestration (authoritative defaults and
  `.env` handling).
- Routing/auth behavior source of truth: `docker/Caddyfile`.
- Runtime process wiring and on-container data layout source of truth:
  `docker/entrypoint.sh` and `docker/backup.sh`.
- This mode assumes single-container, single external port deployment.
- Container runtime data path is fixed to `/app/data` and mounted from the
  host repo data directory.
- Default Docker serving mode is local HTTPS with `tls internal`.
- `docker/run.sh` derives the browser URL as
  `https://<detected-vm-hostname>:<PORT>` and prints the final target before
  starting the container.
- For single-label VM hostnames, Docker local mode appends `.shared`.
  Example: `athena` becomes `https://athena.shared:<PORT>`.
- Docker local mode also derives a hidden Tinyauth canonical URL as
  `https://app.<browser-host>:<PORT>` and relies on Caddy redirect rewriting so
  the browser can keep using the plain browser host.
- In this mode the browser URL and the Tinyauth canonical URL are intentionally
  different.
- Typical Docker setup only requires `AUTH_PASSWORD`; `PORT` remains optional.
- Browser host derivation always follows the VM hostname. If that hostname is
  wrong for browser access, fix the VM hostname itself.
- Browser access must use the exact host and port printed by `docker/run.sh`.
- This local HTTPS mode is intended for private VM-hosted use without a public
  certificate. Browsers will warn until you trust the issuing CA or switch to a
  public certificate workflow.
- Caddy runtime data is persisted under `/app/data`, so once you trust the
  local CA on the host, that trust survives normal container restarts.

### Cloud (Render)

- Source of truth: `render.yaml` (service shape, env defaults, and disk mount).
- Render declares the public host explicitly via `TINYAUTH_APP_URL` and
  requires `AUTH_PASSWORD`.
- Render pins `AUTH_USER=remdo` in the Blueprint, so the login username stays
  stable instead of inheriting the container runtime user.
- In the Blueprint, both `TINYAUTH_APP_URL` and `AUTH_PASSWORD` are marked
  `sync: false`, so you provide them per service in the Render Dashboard
  instead of hardcoding them in repo config.
- Unlike local Docker mode, Render uses the same public URL for both browser
  access and Tinyauth canonical routing.
- The container still listens on plain HTTP at `:${PORT}`; Render terminates
  public HTTPS at the platform edge and forwards traffic to the service port.
- Requests that arrive on non-canonical Render hosts are redirected to
  the configured `TINYAUTH_APP_URL` host before auth runs, so browser host and
  cookie host stay aligned.
- Render limitation: `sync: false` values are only prompted during initial
  Blueprint creation and are not copied to preview environments, so preview or
  staging services must set `TINYAUTH_APP_URL` manually.
- TODO: Backup workflow for hosted prod is not defined yet.

## Backup machine

- Source of truth: `tools/remote/make-backup.sh` (including required
  `PROD_APP_ADDR` default target, optional auto-discovered
  `PROD_APP_ADDR_<suffix>` targets (alphanumeric suffix only), and local backup
  repo assumptions).

## CI

- CI runs on defaults from `tools/env.sh` with no overrides.

## Local tools

- `tools/env.sh <command>` runs any command with derived env defaults.

## Document ID ownership

Document-id ownership rules are defined in
`docs/outliner/note-ids.md#runtime-document-id-ownership`.
