# Test Harness

The test harness gives each working directory an isolated verification runtime
and owns its startup, cleanup, and diagnostic-data lifecycle. The contributor
[testing policy](../../dev/testing.md) separately owns coverage obligations and
automated test-level selection.

## Unit Tests

Unit tests run in-process without a service stack.

## Collaboration Tests

Each collaboration-test invocation starts fresh loopback-only Y-Sweet and RemDo
API services. One collaboration-test invocation runs in a working directory at
a time. Full and filtered invocations use the same lifecycle. Occupied required
ports cause startup to fail and preserve the previous diagnostic runtime.

After its required ports are available, an invocation replaces the previous
collaboration-test runtime data. Completed and interrupted runtime data remains
available until the next invocation reaches that point.

## Browser E2E Tests

Each browser E2E invocation starts a fresh loopback-only app, API, and
collaboration stack and provisions its own authenticated users. One browser E2E
invocation runs in a working directory at a time. Full and filtered invocations
use the same lifecycle. Occupied required ports cause startup to fail; the
invocation neither reuses nor terminates the existing listeners.

Before starting the stack, an invocation replaces the previous browser E2E
runtime data. Completed and interrupted runtime data remains available until
the next invocation.

## Docker E2E Tests

Docker E2E builds and verifies the production-style container stack against
temporary runtime data. It also reaches a production-launcher container through
its bridge-published port. The invocation removes its containers and runtime
data when it finishes or fails.

## CI

CI runs the same full harness variants and lifecycles as local full runs. The CI
runner provides their working-directory and runtime-data isolation.
