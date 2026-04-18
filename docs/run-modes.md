# Run Modes

## Purpose

Define the supported ways RemDo is run today.

A run mode may be a user-facing app runtime, a test harness, CI, or an
operational task such as backup.

Durable product constraints live in [docs/principles.md](./principles.md). This
doc records the current implementation shape.

## Shared rules

For each run mode, the important questions are:

1. what part of RemDo runs
2. for what purpose
3. for whom
4. on what kind of platform
5. what data boundary it uses

## Local development

- Purpose: interactive development of the app and supporting local services.
- User: developer.
- Platform: local machine.
- Data boundary: local repo-owned development data.
- Notes: most local runs can stay on defaults; copy `.env.example` to `.env`
  only when overrides are needed.

## Unit and collab tests

- Purpose: fast automated verification in the local test stack.
- User: developer.
- Platform: local machine.
- Data boundary: local ephemeral or resettable test data.
- Notes: this mode covers the fast local test stack.

## Browser E2E

- Purpose: browser-level verification against the local app stack.
- User: developer.
- Platform: local machine.
- Data boundary: local runtime and test data.
- Notes: this mode uses its own browser/runtime stack.

## Docker prod E2E

- Purpose: end-to-end verification against the production-style Docker stack.
- User: developer.
- Platform: local machine with Docker.
- Data boundary: temporary Docker-managed test data.
- Notes: requires a local Docker daemon.

## CI

- Purpose: automated verification in non-local infrastructure.
- User: project automation.
- Platform: CI runner.
- Data boundary: runner-local temporary data.
- Notes: this mode runs RemDo in the CI stack.

## Host OS self-hosted app

- Purpose: run RemDo directly on a machine without Docker.
- User: self-hosting operator.
- Platform: user-controlled host OS.
- Data boundary: user-controlled local storage.
- Notes:
  1. required: `AUTH_PASSWORD`
  2. optional: `PORT`
  3. if `TINYAUTH_APP_URL` is overridden, browser access must use that same
     host

## Docker self-hosted app

- Purpose: self-hosted app runtime through the local Docker packaging.
- User: self-hosting operator.
- Platform: user-controlled machine with Docker.
- Data boundary: user-controlled persistent Docker-backed storage.
- Notes:
  1. requires a local rootless Docker daemon
  2. the local launcher supports rootless Docker
  3. required: `AUTH_PASSWORD` in `.env`
  4. optional: `PORT`
  5. the script prints the browser URL before startup; use that URL
  6. local Docker uses self-signed HTTPS by default

## Managed cloud app

- Purpose: app runtime on a third-party platform account.
- User: operator with a managed cloud account.
- Platform: managed cloud provider.
- Current implementation: Render.
- Data boundary: provider-hosted persistent storage under the operator's
  account.
- Notes:
  1. required in the Render Dashboard: `AUTH_PASSWORD` and `TINYAUTH_APP_URL`
  2. `AUTH_USER` is fixed to `remdo` in the Blueprint
  3. the service listens on `:${PORT}` and Render terminates public HTTPS
  4. preview or staging services must set `TINYAUTH_APP_URL` manually
  5. backup workflow for hosted prod is still undefined

## Backup run

- Purpose: export or back up persisted RemDo data.
- User: operator.
- Platform: backup machine or host with access to the target runtime data.
- Data boundary: reads from an existing RemDo runtime and writes backup output
  elsewhere.
- Notes: this mode covers the backup/export surface.
