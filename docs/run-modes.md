# Run Modes

RemDo supports user-facing app runtimes and operational tasks such as backup as
distinct run modes.

Durable product constraints live in [docs/principles.md](./principles.md);
supported access cases live in [docs/access-model.md](./access-model.md).

## Shared rules

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
  1. The client may still access linked document sources hosted by self-hosted
     app server or managed cloud app server modes.
  2. Packaging and installation shape are implementation details for this mode.

### Shared app-server runtime

Both app server modes run the RemDo API process and the Y-Sweet collaboration
server behind one [gateway](./architecture.md#gateway). Better Auth runs inside
the RemDo API process and stores users/sessions in the same SQLite database
file as the [document registry](./architecture.md#document-registry).

### Self-hosted app server

- Purpose: run RemDo as a self-hosted server that can be reached from other machines.
- User: self-hosting operator.
- Platform: user-controlled server or machine.
- Data boundary: user-controlled persistent server storage.
- Notes:
  1. launch with `tools/prod/docker.sh`
  2. requires a local rootless Docker daemon
  3. operators set `ADMIN_SECRET`; the rest bootstrap on first run, including
     admin self-enrollment (see
     [docs/access-model.md](./access-model.md#admin-role))
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
     rest bootstrap onto the persistent disk mounted at `/data`
  2. `ALLOW_SIGNUP` should stay `false`
  3. the service binds the Render-injected `PORT` and Render terminates public
     HTTPS

## Operational modes

### Backup/export job

- Purpose: export or back up persisted RemDo data.
- User: operator.
- Platform: backup machine or host with access to the target runtime data.
- Data boundary: reads from an existing RemDo runtime and writes backup output
  elsewhere.
