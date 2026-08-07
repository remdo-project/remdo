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

**Canonical origin.** `APP_PUBLIC_URL` is the single configured public origin.
Its production port is public-facing only and never drives binding.
[Routing and origin](../../architecture.md#routing-and-origin-boundary) owns its
collaboration use; [access control](../access/access-control.md#csrf-protection)
owns its authentication, trusted-origin, and cookie use.

## Secret bootstrap

Operators set one secret, `ADMIN_SECRET`. `ADMIN_SECRET` is never
auto-generated in production.

Guardrails:

- Startup refuses to generate replacement secrets when the
  [production persistence root](../../architecture.md#runtime-persistence-boundary)
  already contains a dataset.

## Validation policy

A resolution boundary rejects declared inputs that are invalid or required there
but missing. Server-only requirements do not apply to browser configuration or
production utilities.
