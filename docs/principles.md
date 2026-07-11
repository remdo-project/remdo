# Project Principles

## Purpose

Define the product assumptions that outrank current implementation details.

## Non-negotiables

1. RemDo is privacy-first.
2. RemDo is fully open source.
3. Transparency comes from code plus simple deployment.
4. Security should rely on trusted building blocks.

## Data and trust

1. User data should live where the user chooses, including user-controlled
   self-hosting, user-owned third-party hosting, and hosted RemDo.
2. The trust story should stay simple enough to verify.
3. Delegate security-critical work when that improves confidence and preserves
   self-hosting simplicity.
4. Production logs and diagnostic output MUST NOT disclose user content,
   credentials, authentication tokens, or other confidential data. Development
   and test output MAY include synthetic fixture data and dedicated
   development/test credentials, but MUST NOT disclose real confidential data.

## Deployment targets

RemDo should support:

1. Easy local development and testing.
2. Easy self-hosting on the user's own hardware or infrastructure.
3. Easy self-hosting on a recommended third-party platform under the user's own
   account.
4. A cloud-hosted offering that feels normal to non-technical users.

## Multi-origin direction

1. One client may use documents from more than one RemDo server.
2. That may include local documents, personally hosted cloud documents, and
   documents hosted by hosted RemDo.
3. The architecture should keep that direction open without requiring the
   implementation to support it.

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
