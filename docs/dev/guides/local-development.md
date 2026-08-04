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

Run `pnpm run dev:data-reset` to update the seeded documents again without
restarting the stack. Pass `--fresh` to delete the previously seeded fixture
documents before recreating them; other documents remain unchanged.

## Run the PWA Preview

Run `pnpm run dev:pwa`. It starts the production-built PWA, API, and
collaboration services on a shifted port range with separate runtime data, so
it can run beside the main development stack. It provisions the same stable
users and fixture documents. Open the preview URL printed by the command.

## Run the Docker App

Run `pnpm run dev:docker` to build and start the production-style Docker app at
the home URL printed by the command. It requires a local rootless Docker daemon.
The app is private, uses separate runtime data, and runs through bridge
networking. Keep the command running while using it.

## Exercise Source Linking

The Docker app can act as a private home server with an already-running local
development server linked as its public source. Rootless Docker Engine 29.5 or
newer provides the host networking used by this workflow.

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
