# Local Development

The local development stack provides the authenticated collaborative app with
stable users and fixture documents for interactive work. This guide covers the
main stack and the adjacent PWA and source-linking workflows.

## Prepare the Workspace

Run `pnpm run dev:init` after a fresh clone or after removing `node_modules`.
The command installs the locked dependencies.

RemDo runs with repository defaults without a `.env` file. To override an
environment [input](../../config.md#inputs), copy `.env.example` to `.env` and
change only that input.
[`PORT_BASE`](../../config.md#derivation-rules) selects the local stack's port
range; a process environment value overrides the `.env` value for a one-off
invocation.

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

## Exercise Source Linking

This workflow runs a private Docker home server and links the local development
server as its public source. It requires a local rootless Docker daemon.

1. Run `pnpm run dev:docker`. Keep it running and note the source command, home
   URL, and source URL it prints.
2. In another terminal, run the printed source command. Its `HOST` and
   `AUTH_URL` make one host-IP origin reachable from both the browser and the
   container.
3. Open the home server's Sharing page, choose **Link source**, and enter the
   printed source URL. Complete sign-in as one of the stable users.

The [source-linking access model](../../access-model.md#cross-server-source-linking)
owns the resulting authorization and delegation behavior.
