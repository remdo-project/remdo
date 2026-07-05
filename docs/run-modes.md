# Run Modes

## Purpose

Define the supported ways RemDo is run. A run mode may be a user-facing app
runtime, a test harness, CI, or an operational task such as backup.

Durable product constraints live in [docs/principles.md](./principles.md);
supported access cases live in [docs/access-model.md](./access-model.md).

## Shared rules

Runtime configuration has one boundary: application code consumes resolved
`config.env` values. `.env` files, shell defaults, Docker launchers, managed
platform settings, and tests are inputs or projections around that boundary, not
separate product contracts.
[docs/config.md](./config.md) owns the configuration contract: settable inputs,
derived values, port regimes, and secret bootstrap. This doc records only the
per-mode facts.

## End-user app modes

### Local self-hosted app

- Purpose: run RemDo as an installed local app on the end user's own machine.
- User: end user.
- Platform: user-controlled local machine.
- Data boundary: local documents stay on the user's own machine.
- Notes:
  1. Local document use in this mode does not require cloud access or server-side auth.
  2. The client may still access linked document sources hosted by self-hosted
     app server or managed cloud app server modes.
  3. Packaging and installation shape are implementation details for this mode.

### Shared app-server runtime

Both app server modes run the RemDo API process and the Y-Sweet collaboration
server behind one [gateway](./architecture.md#gateway). Better Auth runs inside
the RemDo API process and stores users/sessions in the same SQLite database
file as the [document registry](./architecture.md#document-registry). Browsers
reach collaboration only through the
[browser-facing collaboration paths](./architecture.md#browser-facing-collaboration-paths),
and the collaboration server runs with Y-Sweet auth enabled using the
bootstrapped key/server-token pair (see
[secret bootstrap](./config.md#secret-bootstrap)).

### Self-hosted app server

- Purpose: run RemDo as a self-hosted server that can be reached from other machines.
- User: self-hosting operator.
- Platform: user-controlled server or machine.
- Data boundary: user-controlled persistent server storage.
- Notes:
  1. launch with `tools/prod/docker.sh`
  2. requires a local rootless Docker daemon
  3. operators set `ADMIN_SECRET`; the rest bootstrap on first run. The first
     person to visit admin self-enrollment and present the secret registers and
     becomes the admin (see [docs/access-model.md](./access-model.md#admin-role))
  4. set `APP_PUBLIC_URL` to the canonical public URL
  5. local Docker uses self-signed HTTPS by default

### Managed cloud app server

- Purpose: app runtime on a third-party platform account.
- User: operator with a managed cloud account.
- Platform: managed cloud provider (Render).
- Data boundary: provider-hosted persistent storage under the operator's
  account.
- Notes:
  1. required in the Render Dashboard: `ADMIN_SECRET` and `APP_PUBLIC_URL`; the
     rest bootstrap onto the mounted disk, which must be persistent
  2. `ALLOW_SIGNUP` should stay `false`
  3. the service binds the Render-injected `PORT` and Render terminates public
     HTTPS

## Development and verification modes

### Local development

- Purpose: interactive development of the app and supporting local services.
- User: developer.
- Platform: local machine.
- Data boundary: local repo-owned development data.
- Notes:
  1. Most local runs stay on defaults; `.env` (copied from `.env.example`)
     holds overrides, and process environment values override `.env`, so
     one-off runs can use inline values such as `PORT_BASE=4800 ...` without
     editing local defaults. `PORT_BASE` is the one dev port knob and anchors
     the local dev port range (see [docs/config.md](./config.md)).
  2. Dev mode runs the web app with the RemDo API mounted in the Vite dev
     server, plus the Y-Sweet collaboration server. Authentication is enforced,
     and private document access is limited to the registered document owner.
  3. The app is served at `http://127.0.0.1:<PORT>/`, where `PORT` derives from
     `PORT_BASE`. Stable dev users (Alice/Bob; credentials live in
     `tools/lib/stable-auth-users.ts`) sign in at `/login`; seeded fixtures
     appear in the document chooser as documents titled `fixture: <name>` (for
     example `fixture: tree-complex`).
  4. `pnpm run dev:data-reset` provisions the stable Alice/Bob users and seeds
     every `tests/fixtures/*.json` as a document owned by each user, so a fresh
     login always shows browsable content. It is idempotent (ensure + top-up):
     re-runs replace fixture content in place and never touch a user's other
     documents; `--fresh` deletes the previously seeded fixture docs (and their
     collab storage) before reseeding. It requires the dev collab + API stack
     to be running.
  5. `pnpm run dev:pwa` uses `PORT_BASE + 20` for its range and serves the PWA
     preview on that shifted `PORT`, so it can run beside `pnpm run dev`.
  6. `pnpm run dev:docker` starts a Docker home server at
     `127.0.0.1:(PORT_BASE + 40)` for manual OAuth linking against the dev
     server, and redirects the matching `localhost` URL to that canonical
     browser origin. The source dev server must be started with `HOST=0.0.0.0`
     (e.g. `HOST=0.0.0.0 pnpm run dev`) so the Docker home can reach it for the
     OAuth token exchange.
  7. `pnpm run dev:oauth-client` provisions the stable users, prints their
     credentials, and (when `REMDO_DEV_HOME_ORIGIN` is set) creates or rotates
     the source OAuth client used for cross-server linking. It is SQL-only and
     used by the `dev:docker` and Docker e2e flows.
  8. Collaboration access follows the shared
     [browser-facing collaboration paths](./architecture.md#browser-facing-collaboration-paths);
     Y-Sweet auth uses a matched development default key/server-token pair.

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
- Notes: local E2E tests run against the Vite app server with mounted `/api/*`
  routes plus the collaboration server. They reuse already-running local
  services on the configured ports, and create browser auth state through the
  app origin.

### Docker E2E

- Purpose: end-to-end verification against the production-style Docker stack.
- User: developer.
- Platform: local machine with Docker.
- Data boundary: temporary Docker-managed test data.
- Notes: requires a local Docker daemon. The Docker home server uses
  `PORT_BASE + 7` for its public gateway port. OAuth source-linking coverage
  starts a source dev server at `PORT_BASE + 70`.

### CI

- Purpose: automated verification in non-local infrastructure.
- User: project automation.
- Platform: CI runner.
- Data boundary: runner-local temporary data.
- Notes: local-stack E2E starts its required services and does not reuse
  already-running ports.

## Operational modes

### Backup/export job

- Purpose: export or back up persisted RemDo data.
- User: operator.
- Platform: backup machine or host with access to the target runtime data.
- Data boundary: reads from an existing RemDo runtime and writes backup output
  elsewhere.
