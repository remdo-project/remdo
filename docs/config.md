# Configuration

RemDo resolves runtime configuration from declared environment inputs, derived
values, and bootstrapped secrets.

## Resolution boundary

Configuration has one owner: it holds the schema, derives every secondary value,
splits server vs. client config, validates, and bootstraps secrets. Nothing
outside it re-derives configuration; the client sees only the subset marked for
it. Config resolves and secrets bootstrap once per process — in production inside
the Docker entrypoint, so the host needs nothing but Docker.

## Inputs

Cells read `required` (must be set),
`optional` (has a default), `derived` (computed, not settable), or `—` (unused in
that mode). Everything else is derived or bootstrapped, never set in the normal
path.

| Variable | dev / test | server / prod | Role |
| --- | --- | --- | --- |
| `NODE_ENV` | optional | required | `development` / `test` / `production`. |
| `DATA_DIR` | optional | optional | Persistence root for data and bootstrapped secrets (see Secret bootstrap guardrails). |
| `PORT_BASE` | optional | — | Dev stack port base; `PORT` and all secondary ports derive from it. |
| `PORT` | derived | optional | Listen/bind port only; the one prod knob, defaults to `8080`. |
| `HOST` | optional | fixed in-container | Development gateway bind host; defaults to `localhost`. |
| `PUBLIC_HOST` | optional | — | Browser-visible development hostname or IP when it differs from `HOST`. |
| `APP_PUBLIC_URL` | derived | required | Canonical public origin (see below). |
| `ADMIN_SECRET` | optional | required | Admin enrollment gate (see below). |
| `ALLOW_SIGNUP` | optional | optional | Signup and [source-linking](./access-model.md#linking-a-source) public-role policy: public sources allow signup and unauthenticated client registration; private homes refuse signup and can link sources. Defaults true outside production, false in it. |

## Derivation rules

Each fact has one owning input; everything else derives from it in one
direction.

**Ports.** In dev/test `PORT_BASE` is the only port input; `PORT` and every
secondary service port derive from it by fixed offset. A shifted stack derives
its complete port range again. In server/prod the secondary ports are
internal-only behind the gateway and `PORT` is an independent input: a
platform-injected value, else `8080`.

**Development origin.** `HOST` controls only the gateway bind address.
`PUBLIC_HOST` controls the hostname in browser-visible URLs and defaults to
`HOST`. When `HOST` is `0.0.0.0` or `::`, `PUBLIC_HOST` instead defaults to the
machine hostname; an empty or localhost machine hostname requires an explicit
`PUBLIC_HOST`. `APP_PUBLIC_URL` derives as
`http://<PUBLIC_HOST>:<PORT>`.

**Canonical origin.** `APP_PUBLIC_URL` is the single source for link generation,
auth, cookies, CORS, and browser-visible collaboration URLs. Its production port
is public-facing only and never drives binding.

**Gateway boundary.** Development exposes Vite through `HOST`. The RemDo API
and collaboration server bind IPv4 loopback and are reached through the
gateway. Production exposes Caddy while the API and collaboration server remain
on container loopback.

## Secret bootstrap

Operators set one secret, `ADMIN_SECRET`. `AUTH_SECRET` and the Y-Sweet
`auth_key` / `server_token` pair resolve on startup: environment variable if set,
else a persisted file in `DATA_DIR`, else generated and persisted there. The
Y-Sweet pair is generated via `y-sweet gen-auth`. `ADMIN_SECRET` is never
auto-generated in production.

Guardrails:

- Generated secret files are written `0600` and stay outside the image build
  context.
- In production `DATA_DIR` must be a persistent mount (`/data` in the production
  Docker image); startup fails loudly rather than regenerate secrets against an
  existing dataset. A persisted `DATA_DIR` is single-instance.

## Admin bootstrap and enrollment

`ADMIN_SECRET` is the gate for acquiring the admin role; the self-enrollment
flow it gates lives in [docs/access-model.md](./access-model.md#admin-role).

## Validation policy

- Validate the declared schema; fail fast on missing or invalid required values.
- Ignore environment variables outside the schema.

## References

- [The Twelve-Factor App — Config](https://12factor.net/config)
- [Render — Web Services (port binding)](https://render.com/docs/web-services)
