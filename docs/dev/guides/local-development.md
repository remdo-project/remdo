# Local Development

Local development uses stable users and seeded fixture documents, making app
behavior easy to explore and reproduce. This guide covers the main development
workflow, PWA preview, Docker app, and source-linking setup.

## Prepare the Workspace

Run `pnpm run dev:init` after a fresh clone or after removing `node_modules`.
The command installs the locked dependencies.

### Configuration Overrides

Local development resolves configuration from three layers, listed from lowest
to highest precedence:

- Repository defaults work as-is.
- To override defaults for this working directory, copy
  [`.env.example`](../../../.env.example) to `.env` and change only the entries
  you need.
- To override a value for one invocation, set it in the process environment.

### Ports and Network Access

- [`PORT_BASE`](../../specs/runtime/configuration.md#derivation-rules)
  selects the local stack's port range.
- `HOST` controls gateway exposure and defaults to `localhost`. On a headless
  development machine, set `HOST=0.0.0.0`; browser URLs then use the machine
  hostname.
- Set `PUBLIC_HOST` only when the browser reaches the development machine
  through a different hostname or IP.

## Run the Main Development Stack

Run:

```sh
pnpm run dev
```

- **Starts:** the web app and collaboration server.

On a fresh data directory, [reset development data](#reset-development-data)
before signing in.

Open the canonical URL for the stack, sign in with a credential from
[`stable-auth-users.ts`](../../../tools/lib/stable-auth-users.ts), and choose a
document named `fixture: <fixture-name>`. With the default `HOST`, use Vite's
Local URL. With `HOST=0.0.0.0`, use the machine hostname or explicit
`PUBLIC_HOST` from the
[development origin](../../specs/runtime/configuration.md#derivation-rules),
not one of Vite's interface-IP Network URLs.

### Reset Development Data

Run `pnpm run dev:data-reset` while the main stack is running when stable
credentials or fixture documents need restoring. Coordinate before resetting
shared working-directory data because the command replaces fixture contents.

- **Restores:** the stable passwords and current fixture contents.
- **Preserves:** existing document IDs, sharing, and documents not backed by a
  current fixture.

## Run the PWA Preview

Run:

```sh
pnpm run dev:pwa
```

- **Starts:** a PWA build on a shifted port, with server traffic proxied to the
  main development gateway.
- **Exposes:** an IPv4-loopback preview so its browser origin can register a
  service worker.
- **Uses:** the same accounts and documents as the main frontend.
- **Keeps separate:** the preview origin's service worker, caches, and browser
  storage.
- **Requires:** the main development stack.

Open the URL printed by Vite. From a headless development machine, forward the
working directory's port range with
[`open-remdo-tunnel.sh`](../../../tools/remote/open-remdo-tunnel.sh) and open the
preview through `localhost`. Authentication and source-linking flows that need
the canonical app origin may return to the main development frontend.

## Run the Docker App

Run:

```sh
pnpm run dev:docker
```

- **Starts:** a private, production-style Docker app at the printed home URL.
- **Uses:** separate runtime data and host networking within a shifted
  development port range.
- **Requires:** rootless Docker Engine 29.5 or newer.

Keep the command running while using the Docker app.

## Exercise Source Linking

Source linking connects the main development stack as a public source to a
private Docker home. It requires rootless Docker Engine 29.5 or newer.

1. Start the public source:

   ```sh
   pnpm run dev
   ```

2. In another terminal, validate the source and start the private Docker home:

   ```sh
   pnpm run dev:linking
   ```

   The command prints the home and source URLs.
3. On a fresh Docker home, open `/admin` at the printed home URL and complete
   [admin enrollment](../../specs/access/access-control.md#admin-role) using the
   configured `ADMIN_SECRET`.
4. Open the home's Sharing page, choose **Link source**, and enter the printed
   source URL. When redirected to the source, sign in as one of the stable
   users.

The
[source-linking access model](../../specs/access/source-linking.md#cross-server-source-linking)
owns the resulting authorization and delegation behavior.
