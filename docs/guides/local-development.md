# Local Development

This guide owns workspace setup and supported procedures for the
[Development run mode](../run-modes.md#development), including [source-linking](../specs/access/source-linking.md#linking-a-source) workflows.
The [configuration specification](../specs/runtime/configuration.md) owns runtime inputs and derivation;
the [package scripts](../../package.json) own executable commands and their variants.

## Prepare the Workspace

Run `pnpm install --frozen-lockfile` after a fresh clone or after removing
`node_modules`. The command installs the locked dependencies.
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

## Run Main Development

Run:

```sh
pnpm run dev
```

The command starts the web app and collaboration server. On a fresh data
directory, [reset development data](#reset-development-data) before signing in.

Open the canonical URL for the stack, sign in with a credential from
[`stable-auth-users.ts`](../../tools/lib/stable-auth-users.ts), and choose a document named `fixture: <fixture-name>`.
With the default `HOST`, use Vite's Local URL. With `HOST=0.0.0.0`, use the
machine hostname or explicit `PUBLIC_HOST` from the [development origin](../specs/runtime/configuration.md#network-addressing), not one
of Vite's interface-IP Network URLs.

### Reset Development Data

Run `pnpm run dev:data-reset` while Main Development is running when stable
credentials or fixture documents need restoring. Coordinate before resetting
shared working-directory data because the command replaces fixture contents.

- **Restores:** stable passwords and current fixture contents.
- **Preserves:** existing document IDs, sharing, and documents not backed by a
  current fixture.

### Run PWA Preview

With Main Development running, run:

```sh
pnpm run dev:pwa
```

Open the URL printed by Vite. From a headless development machine, forward the
working directory's port range with [`open-remdo-tunnel.sh`](../../tools/remote/open-remdo-tunnel.sh) and open the preview
through `localhost`. Authentication and source-linking flows that need the
canonical app origin may return to the main development frontend.

## Run Local Docker

Local Docker requires rootless Docker Engine 29.5 or newer.
The development `ADMIN_SECRET` defaults to `development-admin-secret-0123456789`.
Run:

```sh
pnpm run dev:docker
```

Open the printed home URL. On a fresh Docker home, open `/admin` and complete
[admin enrollment](../specs/access/access-control.md#admin-role) with `ADMIN_SECRET`.

Keep the command running while using the app. Stopping it removes the container
and retains its development-owned data.

## Exercise Source Linking

[Source linking](../specs/access/source-linking.md#linking-a-source) connects Main Development as a public source to a private
Local Docker home. It uses the [Local Docker prerequisites](#run-local-docker).

1. Start the public source:

   ```sh
   pnpm run dev
   ```

2. In another terminal, validate the source and start the private Docker home:

   ```sh
   pnpm run dev:linking
   ```

   The command prints the home and source URLs.
3. On a fresh Docker home, append `/admin` to the printed home URL and complete
   [admin enrollment](../specs/access/access-control.md#admin-role) with `ADMIN_SECRET`.
4. Open the home's Sharing page, choose **Link source**, and enter the printed
   source URL. When redirected to the source, sign in as a stable user.

The [source-linking access model](../specs/access/source-linking.md#cross-server-source-linking) owns the resulting
authorization and delegation behavior.
