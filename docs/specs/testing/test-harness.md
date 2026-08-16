# Test Harness

The test harness gives each working directory an isolated verification runtime
and owns its startup, cleanup, and diagnostic-data lifecycle.
[Running Tests](../../guides/testing.md) owns supported verification procedures, setup, and invocation.
The contributor [testing policy](../../dev/testing.md) separately owns coverage,
automated test-level selection, and verification lifecycle.
[Run Modes](../../run-modes.md) owns the supported run-mode set.

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

Docker E2E builds and verifies the production container against its own runtime
data. It also reaches a production-launcher container through its
bridge-published port. The invocation removes its containers when it finishes or
fails and retains its runtime data.

Before starting its containers, an invocation replaces the previous Docker E2E
runtime data, including files owned by an earlier invocation's containers.
Completed and interrupted runtime data remains available until the next
invocation. That data carries generated authentication secrets and is not
published as a CI artifact.

## CI Environment

CI runs the same full harness variants and runtime lifecycles as local full
runs. The CI runner provides their working-directory and runtime-data isolation
and additionally retains available browser failure traces as artifacts.
