# Project Principles

## Purpose

Define the product assumptions that outrank current implementation details.

## Non-negotiables

1. RemDo is privacy-first.
2. Privacy is a design constraint.
3. RemDo is fully open source.
4. Transparency comes from code plus simple deployment.
5. Security should rely on trusted building blocks.

## Data and trust

1. User data should live where the user chooses, including user-controlled
   self-hosting, user-owned third-party hosting, and hosted RemDo.
2. The trust story should stay simple enough to verify.
3. Delegate security-critical work when that improves confidence and preserves
   self-hosting simplicity.

## Deployment targets

RemDo should support all of the following:

1. Easy local development and testing.
2. Easy self-hosting on the user's own hardware or infrastructure.
3. Easy self-hosting on a recommended third-party platform under the user's own
   account.
4. A cloud-hosted offering that feels normal to non-technical users.

These are product goals with vendor choice left open.

## Multi-origin direction

1. One client may later use documents from more than one trust domain.
2. That may include local documents, personally hosted cloud documents, and
   hosted-service documents.
3. The architecture should keep that direction open while the implementation
   stays simpler today.

## Architecture test

Prefer solutions that:

1. keep self-hosting simple enough for real users
2. make data location easy to explain
3. minimize custom security-critical code
4. keep self-hosting first-class even when hosted offerings exist
5. keep tooling replaceable when a cleaner design appears

## Replaceable choices

Implementation choices include:

1. auth providers or gateways
2. cloud platforms
3. collaboration backends
4. single-container versus multi-container packaging
5. route shapes, token shapes, and similar implementation details

## Current-state boundary

Current code does not define the long-term architecture. These principles do.
