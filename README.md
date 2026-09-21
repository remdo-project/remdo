# RemDo

**Use your information as one connected whole, wherever it lives.**

RemDo is an open-source workspace for finding, connecting, and working with
information across different sources.

The project currently provides a structured, collaborative outliner with stable
note identity, linking, search, offline support, and sharing between accounts on
one RemDo server. The longer-term direction is to extend the same model across
RemDo servers and information that already lives in email, calendars, files, and
other tools.

## Overview

Information is easy to capture but often difficult to recover later.

A useful piece of context may be in a note, meeting, email thread, calendar
event, or document. Finding one part often still means reconstructing the rest
manually.

RemDo approaches this by treating information as something that can be connected
without first requiring it to be moved into one system.

The intended model is:

- start from whatever piece you remember;
- find or follow related information;
- preserve useful connections between pieces over time;
- keep the underlying sources independently addressable;
- allow information to remain under different storage and trust boundaries.

RemDo is privacy-first, fully open source, and designed to keep self-hosting a
first-class option.

## Current functionality

RemDo currently includes:

- a keyboard-first structured outliner;
- stable, addressable note and document identities;
- links between notes and documents;
- document search and structural navigation;
- realtime collaborative editing;
- offline editing with local persistence;
- authenticated users and document ownership;
- document sharing between users on the same server;
- PWA support;
- self-hosted Docker deployment;
- deployment on Render.

The broader cross-tool model — including sources such as email, calendars, and
external files — is still under development.

## Design principles

A few principles guide the project:

- **Privacy first.** Users should be able to choose where their data lives.
- **Open source.** The implementation and trust boundaries should be
  inspectable.
- **Self-hosting remains first-class.** Hosted operation should not require a
  fundamentally different product.
- **Sources remain independent.** Connecting information should not require
  consolidating everything into one database.
- **Stable identity matters.** Documents and notes have identities independent
  of their displayed text or current location.
- **Implementation details are replaceable.** Product and data-model assumptions
  should outlive individual infrastructure choices.

See [Project Principles](docs/principles.md) for the full set of project-level
assumptions.

## Architecture

RemDo separates the underlying information model from the editor and from
individual data sources.

At the core is an ordered tree of notes with stable identities. Editors and data
sources act as adapters around that model rather than defining it themselves.

The current application uses:

- **React + TypeScript** for the application;
- **Lexical** for editing;
- **Yjs + Hocuspocus** for collaborative document state;
- **IndexedDB** for local/offline document persistence;
- **Django + django-allauth** for authentication and administration;
- **Django REST Framework** for application APIs;
- **Django ORM + SQLite/PostgreSQL** for server-owned metadata;
- **TanStack Query** for account-scoped browser metadata caches;
- **Caddy** for the production gateway;
- **Vite** for the web application and PWA build;
- **Vitest + Playwright** for testing.

A RemDo instance owns its users and documents. Django owns identity, document
metadata, and access decisions; Yjs holds collaborative document content.

See [Architecture](docs/architecture.md) for the detailed boundaries and
terminology.

## Running RemDo

RemDo supports separate production, development, and verification workflows.

### Local development

Requirements:

- Node.js and pnpm at the versions declared in [package.json](package.json)
- uv for the locked Python backend environment
- a modern browser

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Start the application:

```bash
pnpm run dev
```

Startup creates the [development accounts](docs/guides/local-development.md#run-main-development) and prepares the backend environment. A
data reset is not required before signing in. Use [Reset Development Data](docs/guides/local-development.md#reset-development-data) only to
recreate the fixture users and documents.

Repository defaults work without additional configuration. For local overrides,
copy `.env.example` to `.env`.

See [Local Development](docs/guides/local-development.md) for development data,
PWA preview, Docker development, and configuration.

### Production

Production deployments currently support:

- self-hosted Docker;
- Render.

See [Production Deployment](docs/guides/production-deployment.md) for setup and
first-access instructions.

## Testing and verification

Run the unit test suite:

```bash
pnpm test
```

Run end-to-end tests:

```bash
pnpm run test:e2e
```

Run the main static verification checks:

```bash
pnpm run verify
```

The repository also contains collaboration, Docker, performance, lint,
dependency-boundary, unused-code, duplication, and security checks.

See [Running Tests](docs/guides/testing.md) for the supported verification
workflows.

## Documentation

The repository keeps behavioral specifications separate from implementation
details. Useful starting points include:

- [Project Principles](docs/principles.md)
- [Architecture](docs/architecture.md)
- [Run Modes](docs/run-modes.md)
- [Local Development](docs/guides/local-development.md)
- [Production Deployment](docs/guides/production-deployment.md)
- [Note Model](docs/specs/outliner/note-model.md)
- [Links](docs/specs/outliner/links.md)
- [Search](docs/specs/outliner/search.md)
- [Access Control](docs/specs/access/access-control.md)

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Project status

RemDo is under active development.

The core RemDo-native workspace, collaboration, local access model, and offline
behavior are implemented. Cross-server access and broader integration with
external information sources remain follow-up work.

Interfaces, data models, and deployment details may still change as the project
evolves.

## License

RemDo is open source under the [MIT License](LICENSE).
