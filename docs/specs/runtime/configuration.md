# Configuration

RemDo resolves runtime configuration across server and browser boundaries.

## Resolution boundary

Runtime consumers obtain configuration only from the resolved result. Only
explicitly projected values are available to the browser; all other values
remain server-only.

Missing or invalid configuration fails at the boundary that requires it.
Server-only requirements do not apply to browser configuration or production utilities.

## Derivation rules

Each derived value has one authoritative input. Shifting a local stack shifts
its complete port range as one unit.

Development binding and browser addressing have separate owners. `HOST` selects
the gateway bind address. `PUBLIC_HOST` selects the hostname used in public URLs
and defaults to `HOST`; with `HOST=0.0.0.0`, it instead defaults to the machine
hostname and must be supplied when that hostname is not browser-visible. The
canonical development origin, `APP_PUBLIC_URL`, derives as `http://<PUBLIC_HOST>:<PORT>`.

`APP_PUBLIC_URL` is a server's single canonical public origin. In production it
does not drive the bind address or port. The repository Docker launcher derives
it from the selected public host and `PORT` only when the operator omits it.
[Routing and origin](../../architecture.md#routing-and-origin-boundary) owns its collaboration use; [access control](../access/access-control.md#csrf-protection)
owns its authentication use.

## Secret bootstrap

Production [admin enrollment](../access/access-control.md#admin-role) requires
an operator-supplied secret; startup never generates it.

Production startup resolves the application authentication secret and matched
Y-Sweet authentication pair from operator input, then persisted values,
otherwise generates and persists them. Generated runtime secrets are accessible
only to their owner. Startup refuses to generate replacements when the
[production persistence root](../../architecture.md#runtime-persistence-boundary) already contains a dataset.
