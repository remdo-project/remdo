# Configuration

RemDo resolves runtime configuration from declared environment inputs, derived
values, and bootstrapped secrets.

## Resolution boundary

Launch preparation supplies defaults and derived values before application
configuration resolves. Runtime consumers use the resolved result rather than
rereading or independently deriving configuration. The browser receives only an
explicit projection; all other resolved values remain server-only.

## Configuration ownership

Copyable operator overrides for local development and repository-run production
are catalogued in [`.env.example`](../../../.env.example). It is the curated
operator surface, not an exhaustive list of process variables.

The executable owners define the exact mechanism:

- [`schema.ts`](../../../config/env/schema.ts) declares accepted application
  inputs and the browser projection; [`resolve.ts`](../../../config/env/resolve.ts)
  validates and resolves them.
- [`env.defaults.sh`](../../../tools/env.defaults.sh) owns mode defaults and
  secondary derived values.
- The [production launcher](../../../tools/prod/docker.sh) and
  [container entrypoint](../../../docker/entrypoint.sh) own production launch
  preparation and secret bootstrap.

## Derivation rules

Each fact has one owning input; everything else derives from it in one
direction.

**Ports.** In dev/test `PORT_BASE` is the only port input; `PORT` and every
secondary service port derive from it by fixed offset. A shifted stack derives
its complete port range again. In server/prod the secondary ports are
internal-only behind the gateway and `PORT` is an independent input: a
platform-injected value, else `8080`.

**Development origin.** `HOST` controls only the gateway bind address.
Development host inputs support hostnames and IPv4 addresses; IPv6 literals
and IPv6 wildcard binding are unsupported.
`PUBLIC_HOST` controls the hostname in browser-visible URLs and defaults to
`HOST`. When `HOST` is `0.0.0.0`, `PUBLIC_HOST` instead defaults to the machine
hostname; an empty or localhost machine hostname requires an explicit
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
flow it gates lives in
[Access control](../access/access-control.md#admin-role).

## Validation policy

A resolution boundary rejects declared inputs that are invalid or required there
but missing. Server-only requirements do not apply to browser configuration or
production utilities.

## References

- [The Twelve-Factor App — Config](https://12factor.net/config)
- [Render — Web Services (port binding)](https://render.com/docs/web-services)
