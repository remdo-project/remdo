# Local Development

This guide owns workspace setup and supported procedures for the
[Development run mode](../run-modes.md#development).
The [configuration specification](../specs/runtime/configuration.md) owns runtime inputs and derivation;
the [package scripts](../../package.json) own executable commands and their variants.

## Prepare the Workspace

Run `pnpm install --frozen-lockfile` after a fresh clone or after removing
`node_modules`. The command installs the locked frontend dependencies. Install
[uv](https://docs.astral.sh/uv/getting-started/installation/); backend commands automatically prepare the Python environment using
[`.python-version`](../../.python-version) and [`uv.lock`](../../uv.lock). Run `uv sync --locked` only if you want to
prepare it in advance, for example for your editor.
[Running Tests](testing.md) owns test-specific preparation.

## Configure Local Runs

Local configuration resolves three layers, from lowest to highest precedence:

- Repository defaults work as-is.
- To override defaults for this working directory, copy
  [`.env.example`](../../.env.example) to `.env` and change only the entries you need.
- To override a value for one invocation, set it in the process environment.

[`PORT_BASE`](../specs/runtime/configuration.md#network-addressing) selects the local stack's port range. `HOST` controls gateway
exposure and defaults to `localhost`. On a headless development machine, set
`HOST=0.0.0.0`; browser URLs then use the machine hostname. Set `PUBLIC_HOST`
only when the browser reaches the machine through a different hostname or IP.

For independent checkouts, set one `PORT_BASE` in each checkout's `.env`, such as
`5000` and `7000`. Each checkout keeps its own dependencies, Python environment
and default `data/` root. Use a fresh shell or explicit environment overrides
when switching checkouts: process environment values take precedence over `.env`.

Select a fresh [`DATA_DIR`](../specs/runtime/configuration.md#persistence) before
startup for development data that predates the current schema, following the
[compatibility policy](../../CONTRIBUTING.md#backward-compatibility-pre-10).

Run backend management commands with `./tools/django.sh <command>`. This shell
entry point reads checkout configuration and invokes Python directly. To run
only the development API, use `pnpm run dev:api`.
With deployment variables already supplied, native
`uv run --locked python backend/manage.py <command>` works without the shell launcher.
Each entry point follows [settings selection](../specs/runtime/configuration.md#resolution-boundary).

## Update API Clients

After changing application serializers or allauth configuration, run
`pnpm run api:generate`. The command exports the configured OpenAPI schemas and
regenerates the browser's [application](../../src/platform/http/api-schema.d.ts)
and [account](../../src/platform/http/auth-schema.d.ts) types. `pnpm run api:check`
checks that the generated clients match the backend; `pnpm run verify` includes
that check.

## Run Main Development

Run:

```sh
pnpm run dev
```

The command starts the web gateway, Django API, and collaboration server. Django
applies pending migrations before listening and reloads when Python code changes.
Startup creates missing [development accounts](../../backend/fixtures/development-users.json): Alice is an administrator and
Bob is a regular user. Sign in with `alice@example.test` / `alice-password-1234`
or `bob@example.test` / `bob-password-1234`. Restarting preserves accounts and
documents. The app opens allauth's sign-in page at `/accounts/login/`. After
logout, choose **Sign in** to open that page again. Use `/admin/` to manage
accounts and Home to create or open documents.

With the default `HOST`, use Vite's Local URL. With `HOST=0.0.0.0`, use the
machine hostname or explicit `PUBLIC_HOST` from the [development origin](../specs/runtime/configuration.md#network-addressing), not one
of Vite's interface-IP Network URLs.

### Reset Development Data

Run `pnpm run dev:data-reset` while Main Development is running to recreate the
stable development users and their fixture documents. Coordinate before
resetting shared working-directory data because the command deletes every
email-matched stable user and their documents before creating fresh users and documents.

The command creates fresh document IDs, loads the fixture contents, and waits
for collaboration persistence before completing. Fixture management commands
are available only in Development and Verification; Production uses Django's
normal account administration.

The reset revokes the stable users' sessions. It preserves unrelated local users
and their data. Removed document
IDs remain inaccessible, but the live collaboration service does not reclaim
their underlying storage.

### Run PWA Preview

With Main Development running, run:

```sh
pnpm run dev:pwa
```

Open the URL printed by Vite. From a headless development machine, forward the
working directory's port range with [`open-remdo-tunnel.sh`](../../tools/remote/open-remdo-tunnel.sh) and open the preview
through `localhost`. Authentication flows that need the
canonical app origin may return to the main development frontend.

## Run Local Docker

Local Docker requires rootless Docker Engine 29.5 or newer.
Run:

```sh
pnpm run dev:docker
```

Open the printed home URL and sign in with a [development account](../../backend/fixtures/development-users.json).
The Django container provisions these accounts on startup; Alice can also sign
in at `/admin/`.

Keep the command running while using the app. Stopping it removes the container
and retains its development-owned data.
