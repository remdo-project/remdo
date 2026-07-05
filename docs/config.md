# Configuration

## Purpose

Define how RemDo resolves runtime configuration: which environment variables are
real inputs, which values are derived, and how secrets are bootstrapped.

## Resolution boundary

Configuration has one owner: it holds the schema, derives every secondary value,
splits server vs. client config, validates, and bootstraps secrets. Nothing
outside it re-derives configuration; the client sees only the subset marked for
it. Config resolves and secrets bootstrap once per process — in production inside
the Docker entrypoint, so the host needs nothing but Docker.

## Inputs

Cells read `required` (must be set),
`optional` (has a default), `derived` (computed, not settable), or `—` (unused in
that mode). Everything else — all secondary service ports, `AUTH_URL`,
`AUTH_SECRET`, the Y-Sweet `auth_key` / `server_token` pair, and the Caddy gateway
variables — is derived or bootstrapped, never set in the normal path.

| Variable          | dev / test | server / prod      | Role                                                          |
| ----------------- | ---------- | ------------------ | ------------------------------------------------------------- |
| `NODE_ENV`        | optional   | required           | `development` / `test` / `production`.                        |
| `DATA_DIR`        | optional   | optional           | Persistence root for data and bootstrapped secrets (see Secret bootstrap guardrails). |
| `PORT_BASE`       | optional   | —                  | Dev port base; `PORT` and all secondary ports derive from it. |
| `PORT`            | derived    | optional           | Listen/bind port only; the one prod knob, defaults to `8080`. |
| `HOST`            | optional   | fixed in-container | Bind host. The container entrypoint pins it to `127.0.0.1` so the API listens on the IPv4 loopback Caddy proxies to (`localhost` can resolve to `::1`, leaving the API IPv6-only and unreachable). |
| `APP_PUBLIC_URL`  | —          | required           | Canonical public origin (see below).                          |
| `ADMIN_SECRET`    | optional   | required           | Admin enrollment gate (see below).                            |
| `ALLOW_SIGNUP`    | optional   | optional           | Signup policy. Defaults true outside production, false in it.  |

## Derivation rules

Each fact has one owning input; everything else derives from it in one
direction.

**Ports.** In dev/test `PORT_BASE` is the only port input; `PORT` and every
secondary service port derive from it by fixed offset. In server/prod the
secondary ports are internal-only (behind the gateway) and `PORT` is an
independent input: a platform-injected value, else `8080`.

**Public identity vs. bind port.** `APP_PUBLIC_URL` is the canonical public origin
and the single source for link generation, `AUTH_URL`, cookies, and CORS. Its
port is public-facing only and never drives binding, so a public `:443` fronting
a container that binds `:8080` is normal, not a misconfiguration.

**Auth URL.** Always derived: from `APP_PUBLIC_URL` in server/prod, else
`http://<host>:<PORT>`.

## Secret bootstrap

Operators set one secret, `ADMIN_SECRET`. `AUTH_SECRET` and the Y-Sweet
`auth_key` / `server_token` pair resolve on startup: environment variable if set,
else a persisted file in `DATA_DIR`, else generated and persisted there. The
Y-Sweet pair is generated via `y-sweet gen-auth`. `ADMIN_SECRET` is never
auto-generated in production.

Guardrails:

- Generated secret files are written `0600` and stay outside the image build
  context.
- In production `DATA_DIR` must be a persistent mount; startup fails loudly
  rather than regenerate secrets against an existing dataset. A persisted
  `DATA_DIR` is single-instance.

## Admin bootstrap and enrollment

`ADMIN_SECRET` is the gate for acquiring the admin role. The self-enrollment flow it gates
(including first-admin bootstrap) lives in
[docs/access-model.md](./access-model.md#admin-role).

## Validation policy

- Validate the declared schema; fail fast on missing or invalid required values.
- Ignore environment variables outside the schema.

## References

- [The Twelve-Factor App — Config](https://12factor.net/config)
- [Render — Web Services (port binding)](https://render.com/docs/web-services)
