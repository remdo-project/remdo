# Configuration

RemDo resolves runtime configuration from declared environment inputs, derived
values, and bootstrapped secrets.

## Resolution boundary

Launch preparation supplies defaults and derived values before application
configuration resolves. Runtime consumers use the resolved result rather than
rereading or independently deriving configuration. The browser receives only an
explicit projection; all other resolved values remain server-only.

## Derivation rules

Each fact has one owning input; everything else derives from it in one
direction.

**Ports.** A shifted stack derives its complete port range again. In server/prod
`PORT` is an independent input.

**Development origin.** `HOST` controls only the gateway bind address.

**Canonical origin.** `APP_PUBLIC_URL` is the single source for link generation,
auth, cookies, CORS, and browser-visible collaboration URLs. Its production port
is public-facing only and never drives binding.

**Gateway boundary.** The RemDo API and collaboration server bind IPv4 loopback
and are reached through the gateway. Production exposes Caddy while the API and
collaboration server remain on container loopback.

## Secret bootstrap

Operators set one secret, `ADMIN_SECRET`. `ADMIN_SECRET` is never
auto-generated in production.

Guardrails:

- In production `DATA_DIR` must be a persistent mount; startup fails loudly
  rather than regenerate secrets against an existing dataset. A persisted
  `DATA_DIR` is single-instance.

## Admin bootstrap and enrollment

`ADMIN_SECRET` is the gate for acquiring the admin role; the self-enrollment
flow it gates lives in
[Access control](../access/access-control.md#admin-role).

## Validation policy

A resolution boundary rejects declared inputs that are invalid or required there
but missing. Server-only requirements do not apply to browser configuration or
production utilities.
