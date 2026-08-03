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
range.

## Run the App with Fixture Documents

1. Start the app and collaboration server:

   ```sh
   pnpm run dev
   ```

2. In another terminal, provision the stable Alice and Bob accounts and seed
   every `tests/fixtures/*.json` document for both users:

   ```sh
   pnpm run dev:data-reset
   ```

   Re-running the command updates seeded fixture documents in place and leaves
   other documents unchanged. Pass `--fresh` to delete the previously seeded
   fixture documents before recreating them.

3. Open `http://127.0.0.1:<PORT>/`, sign in with a credential from
   [`stable-auth-users.ts`](../../../tools/lib/stable-auth-users.ts), and choose
   a document named `fixture: <fixture-name>`.

Run `pnpm run dev:users` instead when the stable accounts and their printed
credentials are useful without fixture documents.

## Run the PWA Preview

Run `pnpm run dev:pwa`. It starts the production-built PWA, API, and
collaboration services on a shifted port range, so it can run beside the main
development stack. Open the preview URL printed by the command.

## Run the Docker App

Run `pnpm run dev:docker` to build and start the production-style Docker app at
the home URL printed by the command. It requires a local rootless Docker daemon.
Keep the command running while using the app.

## Exercise Source Linking

The Docker app can act as a private home server with the local development
server linked as its public source. The `dev:docker` command prints the source
command and source URL used by this workflow.

1. Start the Docker app as described above.
2. In another terminal, run its printed source command. The command's `HOST` and
   `AUTH_URL` make one host-IP origin reachable from both the browser and the
   container.
3. Open the home server's Sharing page, choose **Link source**, and enter the
   printed source URL. Complete sign-in as one of the stable users.

The [source-linking access model](../../access-model.md#cross-server-source-linking)
owns the resulting authorization and delegation behavior.
