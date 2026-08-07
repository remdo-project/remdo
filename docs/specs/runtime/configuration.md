# Configuration

RemDo resolves runtime configuration across server and browser boundaries.

## Resolution boundary

Runtime consumers obtain configuration only from the resolved result. Only
explicitly projected values are available to the browser; all other values
remain server-only.

Missing or invalid configuration fails at the boundary that requires it.
Server-only requirements do not apply to browser configuration or production
utilities.

## Derivation rules

Each derived value has one authoritative input. Shifting a local stack shifts
its complete port range as one unit.

A server has one configured canonical public origin, independent of its bind
address and port. [Routing and origin](../../architecture.md#routing-and-origin-boundary)
owns its collaboration use; [access control](../access/access-control.md#csrf-protection)
owns its authentication use.

## Secret bootstrap

Production [admin enrollment](../access/access-control.md#admin-role) requires
an operator-supplied secret; startup never generates it.

Generated runtime secrets persist across restarts and are accessible only to
their owner. Startup refuses to generate replacements when the
[production persistence root](../../architecture.md#runtime-persistence-boundary)
already contains a dataset.
