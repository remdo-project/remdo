# Local Development

Local development uses stable users and seeded fixture documents, making app
behavior easy to explore and reproduce. This guide covers the main development
workflow, PWA preview, Docker app, and source-linking setup.

## Prepare the Workspace

Run `pnpm run dev:init` after a fresh clone or after removing `node_modules`.
The command installs the locked dependencies.

Local development resolves configuration from three layers, listed from lowest
to highest precedence:

- Repository defaults work without a `.env` file.
- `.env` holds working-directory overrides. Create it by copying `.env.example`
  and change only the [inputs](../../config.md#inputs) you need.
- Process environment values override `.env` for one invocation.

[`PORT_BASE`](../../config.md#derivation-rules) selects the local stack's port
range. The default gateway is available only on `localhost`. On a headless
development machine, set `HOST=0.0.0.0`; browser URLs then use the machine
hostname. Set `PUBLIC_HOST` only when the browser reaches that machine through a
different hostname or IP.

## Run the App with Fixture Documents

Start the app, collaboration server, stable Alice and Bob accounts, and seeded
fixture documents:

```sh
pnpm run dev
```

Open the URL printed by Vite, sign in with a credential from
[`stable-auth-users.ts`](../../../tools/lib/stable-auth-users.ts), and choose a
document named `fixture: <fixture-name>`.

Run `pnpm run dev:data-reset` to restore the stable passwords and update the
current fixture documents without restarting the stack. Existing document IDs,
sharing, and other documents remain unchanged.

## Run the PWA Preview

With the main development stack running, run `pnpm run dev:pwa`. It builds the
PWA and serves it on a shifted port while proxying server traffic to the main
development gateway, so both frontends use the same accounts and documents.
The preview origin retains its own service worker, caches, and browser storage.
Open the URL printed by Vite. Authentication and source-linking flows that need
the canonical app origin may return to the main development frontend.

## Run the Docker App

Run `pnpm run dev:docker` to build and start the production-style Docker app at
the home URL printed by the command. It requires rootless Docker Engine 29.5 or
newer. The app is private, uses separate runtime data, and uses host networking
within its shifted development port range. Keep the command running while using
it.

## Exercise Source Linking

The Docker app can act as a private home server with an already-running local
development server linked as its public source.

1. Start the source with `pnpm run dev`.
2. In another terminal, run `pnpm run dev:linking`. It validates the source and
   starts the private Docker home.
3. On a fresh Docker home, open `/admin` at the printed home URL and complete
   [admin enrollment](../../access-model.md#admin-role) using the configured
   `ADMIN_SECRET`.
4. Open the home's Sharing page, choose **Link source**, and enter the printed
   source URL. When redirected to the source, sign in as one of the stable
   users.

The [source-linking access model](../../access-model.md#cross-server-source-linking)
owns the resulting authorization and delegation behavior.
