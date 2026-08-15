# Configuration

RemDo resolves runtime configuration across server and browser boundaries.

## Resolution boundary

Runtime consumers obtain configuration only from the resolved result. Only
explicitly projected values are available to the browser; all other values
remain server-only.

Missing or invalid configuration fails at the boundary that requires it.
Server-only requirements do not apply to browser configuration or production utilities.

## Network addressing

- `APP_ORIGIN` is the server's canonical browser-visible origin.
  Development derives it as `http://<PUBLIC_HOST>:<PORT>`. The self-hosted
  production launcher defaults it to `https://remdo.localhost:8443` for
  loopback-only access; direct self-hosted exposure and externally hosted
  production require an explicit exact HTTPS origin. The application server
  also accepts the development container's derived HTTP origin. For self-hosted
  Docker, its effective port selects the host-side published
  [gateway](../../architecture.md#gateway) port; ports reserved for
  container-internal services are rejected.
  [Routing and origin](../../architecture.md#routing-and-origin-boundary) owns its collaboration use;
  [access control](../access/access-control.md#csrf-protection) owns its authentication use.
- `HOST` selects the gateway bind address in development. For self-hosted
  Docker, it selects only the host-side publish address and defaults to
  `127.0.0.1`. The self-hosted launcher accepts only that loopback address or
  `HOST=0.0.0.0`, which explicitly publishes the standard HTTPS port on every
  IPv4 interface.
- `PORT` is the gateway port derived from `PORT_BASE` in development and
  verification. In externally terminated production, the hosting platform
  supplies it as the internal gateway listen port; it may differ from the
  effective port of `APP_ORIGIN`. It is not a self-hosted Docker input.
- `PORT_BASE` selects the development or verification stack's port range.
  Shifting it shifts every derived port as one unit. It has no production role.
- `PUBLIC_HOST` selects the browser-visible hostname in development. It
  defaults to `HOST`; with `HOST=0.0.0.0`, it defaults to the machine hostname
  and must be set explicitly when that hostname is not browser-visible. It has
  no production role.

For self-hosted Docker, network mode and container addresses and ports are not
operator settings.

## Persistence

`DATA_DIR` selects the
[persistent runtime data root](../../architecture.md#runtime-persistence-boundary).
Development defaults it to `data` inside the repository. The self-hosted
production launcher defaults its host directory to `data/production` inside
the repository; production containers use `/data` for the mounted root.

## Secret bootstrap

Production [admin enrollment](../access/access-control.md#admin-role) requires
an operator-supplied secret of at least 32 characters; startup never generates
it.

Production startup resolves the application authentication secret and matched
Y-Sweet authentication pair from operator input, then persisted values,
otherwise generates and persists them. Generated runtime secrets are accessible
only to their owner. Startup refuses to generate replacements when the
[production persistence root](../../architecture.md#runtime-persistence-boundary) already contains a dataset.
