# Project Principles

RemDo's product principles are assumptions that outrank current implementation details.

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
4. Production logs and diagnostic output must not disclose user content,
   credentials, authentication tokens, or other confidential data. Development
   and test output may include synthetic fixture data and dedicated
   development/test credentials, but must not disclose real confidential data.
5. Derived data should respect the privacy and access boundaries of its sources.

## Deployment targets

These are long-term targets; [Run Modes](run-modes.md) owns the supported run modes.

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
3. Discovery should extend across documents and other information sources
   through adapters, preserving source identity, authority, and capabilities.
4. The architecture should keep that direction open without requiring the
   implementation to support it.

## Interaction and discovery

The [search specification](specs/outliner/search.md) defines document-search behavior.

1. Discovery work should not perceptibly slow editing or navigation.
2. Search should open without perceptible delay. Results over available
   information should update immediately as the query changes, without waiting
   for additional sources.
3. Recent committed local edits should be discoverable when a query is evaluated,
   and incomplete or stale source coverage should be distinguished from no matches.
4. Background work should respect device-appropriate CPU, memory, and storage
   budgets; derived data should be rebuildable from its sources.

## Consumer APIs

The [open document](specs/outliner/open-document.md) defines the opened-document boundary.

1. Consumers should access notes, observe changes, and invoke supported
   operations through a simple, consistent, adapter-neutral API that is easy to
   use correctly and minimizes what consumers must remember.
   Prefer established API models as defaults where they simplify consumption.
   Departures should address concrete consumer needs and preserve coherence
   across the API.
2. Consumer-facing concepts and operation semantics should stay stable as
   implementation choices change.
3. Ordinary consumers should not have to manage adapter transactions, indexing,
   or storage machinery.

## Architecture test

Prefer solutions that:

1. keep self-hosting simple enough for real users
2. make data location easy to explain
3. minimize custom security-critical code
4. keep self-hosting first-class even when hosted offerings exist
5. keep tooling replaceable when a cleaner design appears
6. reuse established library APIs and machinery when they reduce total complexity

## Replaceable choices

Implementation choices include:

1. auth providers or gateways
2. cloud platforms
3. collaboration backends
4. single-container versus multi-container packaging
5. route shapes, token shapes, and similar implementation details

## Current-state boundary

Current code does not define the long-term architecture. These principles do.
