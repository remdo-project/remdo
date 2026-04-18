# Project Principles

## Purpose

Define the product assumptions that outrank current implementation details.

## Non-negotiables

1. RemDo is privacy-first.
2. Privacy is a design constraint, not a slogan.
3. RemDo is fully open source.
4. Transparency comes from code plus simple deployment.
5. Security should rely on trusted building blocks, not ad hoc auth logic.

## Data and trust

1. User data should live where the user chooses, including user-controlled
   self-hosting, user-owned third-party hosting, and hosted RemDo.
2. Open source is not enough if the trust story is still too hard to verify.
3. Delegate security-critical work when that improves confidence without
   undermining self-hosting simplicity.

## Deployment targets

RemDo should support all of the following:

1. Easy local development and testing.
2. Easy self-hosting on the user's own hardware or infrastructure.
3. Easy self-hosting on a recommended third-party platform under the user's own
   account.
4. A cloud-hosted offering that feels normal to non-technical users.

These are product goals, not vendor commitments.

## Multi-origin direction

1. One client may later use documents from more than one trust domain.
2. That may include local documents, personally hosted cloud documents, and
   hosted-service documents.
3. Today's single-server model is an implementation state, not product truth.

## Architecture test

Prefer solutions that:

1. keep self-hosting simple enough for real users
2. make data location easy to explain
3. minimize custom security-critical code
4. keep self-hosting first-class even when hosted offerings exist
5. keep tooling replaceable when a cleaner design appears

## Replaceable choices

These are implementation choices, not principles:

1. auth providers or gateways
2. cloud platforms
3. collaboration backends
4. single-container versus multi-container packaging
5. route shapes, token shapes, and similar implementation details

## Current-state boundary

Current code is not automatically a durable architecture commitment. If current
implementation conflicts with these principles, the principles win.
