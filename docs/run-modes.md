# Run Modes

## Purpose

Define the supported ways RemDo is run today.

A run mode may be a user-facing app runtime, a test harness, CI, or an
operational task such as backup.

Durable product constraints live in [docs/principles.md](./principles.md).
Supported access cases live in [docs/access-model.md](./access-model.md).
This doc records the current implementation shape.

## Shared rules

For each run mode, the important questions are:

1. what part of RemDo runs
2. for what purpose
3. for whom
4. on what kind of platform
5. what data boundary it uses

## End-user app modes

### Local self-hosted app

- Purpose: run RemDo as an installed local app on the end user's own machine.
- User: end user.
- Platform: user-controlled local machine.
- Data boundary: local documents stay on the user's own machine.
- Notes:
  1. Local document use in this mode does not require cloud access or server-side auth.
  2. The client may still access remote documents hosted by self-hosted app server
     or managed cloud app server modes.
  3. Packaging and installation shape are implementation details for this mode.

### Self-hosted app server

- Purpose: run RemDo as a self-hosted server that can be reached from other machines.
- User: self-hosting operator.
- Platform: user-controlled server or machine.
- Data boundary: user-controlled persistent server storage.
- Notes:
  1. requires a local rootless Docker daemon
  2. the local launcher supports rootless Docker
  3. required: `AUTH_SECRET`, `ADMIN_SECRET`, `YSWEET_AUTH_KEY`, and
     `YSWEET_SERVER_TOKEN` in `.env`
  4. optional: `PORT`
  5. the script prints the browser URL before startup; use that URL
  6. local Docker uses self-signed HTTPS by default
  7. current server runtime runs both the RemDo API process and the Y-Sweet
     collaboration server behind the same gateway
  8. Better Auth runs inside the RemDo API process and stores users/sessions
     in the same SQLite database file as the document registry; the registry
     owns document ownership, document titles, and per-user config/home rows,
     while Y-Sweet persists normal documents and the read-only user-config
     projection
  9. browser clients reach collaboration through RemDo API token issuance and
     the proxied Y-Sweet sync path (`/d/*`), not direct Y-Sweet document-control
     routes
  10. the collaboration server runs with Y-Sweet auth enabled; Y-Sweet startup
      uses `YSWEET_AUTH_KEY`, while the RemDo API uses the matching
      `YSWEET_SERVER_TOKEN` server token

### Managed cloud app server

- Purpose: app runtime on a third-party platform account.
- User: operator with a managed cloud account.
- Platform: managed cloud provider.
- Current implementation: Render.
- Data boundary: provider-hosted persistent storage under the operator's
  account.
- Notes:
  1. required in the Render Dashboard: `AUTH_SECRET`, `ADMIN_SECRET`,
     `YSWEET_AUTH_KEY`, `YSWEET_SERVER_TOKEN`, and `APP_PUBLIC_URL`
  2. `ALLOW_SIGNUP` should stay `false`
  3. the service listens on `:${PORT}` and Render terminates public HTTPS
  4. backup workflow for hosted prod is still undefined
  5. current server runtime runs both the RemDo API process and the Y-Sweet
     collaboration server behind the same gateway
  6. Better Auth users/sessions and the SQLite-backed document registry share
     the same RemDo-owned DB file; the registry owns document ownership,
     document titles, and per-user config/home rows, while Y-Sweet persists
     normal documents and the read-only user-config projection
  7. browser clients reach collaboration through RemDo API token issuance and
     the proxied Y-Sweet sync path (`/d/*`), not direct Y-Sweet document-control
     routes
  8. the collaboration server runs with Y-Sweet auth enabled; Y-Sweet startup
     uses `YSWEET_AUTH_KEY`, while the RemDo API uses the matching
     `YSWEET_SERVER_TOKEN` server token

## Development and verification modes

### Local development

- Purpose: interactive development of the app and supporting local services.
- User: developer.
- Platform: local machine.
- Data boundary: local repo-owned development data.
- Notes: most local runs can stay on defaults; copy `.env.example` to `.env`
  only when overrides are needed. Process environment values override `.env`,
  so one-off runs can use inline values such as `PORT=4800 ...` without editing
  local defaults. Current dev mode runs the web app, RemDo API server, Y-Sweet
  collaboration server, and preview helper together. Server modes run the
  RemDo API with Better Auth plus a SQLite-backed document registry.
  Authentication is enforced, and private document access is limited to the
  registered document owner. Browser clients use the RemDo API token path plus
  `/d/*`; `/doc*` control routes are not routed through the gateway. Y-Sweet
  auth uses a matched development default key/token pair unless
  `YSWEET_AUTH_KEY` and `YSWEET_SERVER_TOKEN` are set.

### Unit and collab tests

- Purpose: fast automated verification in the local test stack.
- User: developer.
- Platform: local machine.
- Data boundary: local resettable runtime/test data.
- Notes: collab tests use the configured local stack. They start missing
  services and reuse already-running services on those ports. Auth test users
  use a RemDo-specific email prefix, and stale prefixed users/document rows are
  cleaned at startup.

### Browser E2E

- Purpose: browser-level verification against the local app stack.
- User: developer.
- Platform: local machine.
- Data boundary: local runtime and test data.
- Notes: local E2E tests use the configured local stack and follow the same
  service start/reuse policy as collab tests.

### Docker prod E2E

- Purpose: end-to-end verification against the production-style Docker stack.
- User: developer.
- Platform: local machine with Docker.
- Data boundary: temporary Docker-managed test data.
- Notes: requires a local Docker daemon.

### CI

- Purpose: automated verification in non-local infrastructure.
- User: project automation.
- Platform: CI runner.
- Data boundary: runner-local temporary data.
- Notes: this mode runs RemDo in the CI stack.

## Operational modes

### Backup/export job

- Purpose: export or back up persisted RemDo data.
- User: operator.
- Platform: backup machine or host with access to the target runtime data.
- Data boundary: reads from an existing RemDo runtime and writes backup output
  elsewhere.
- Notes: this mode covers the backup/export surface.
