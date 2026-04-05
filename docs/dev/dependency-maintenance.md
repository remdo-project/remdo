# Dependency Maintenance

Use this doc during dependency refresh work to review temporary workarounds and
intentionally held-back versions.

## Temporary Workarounds

Check these after dependency or runtime updates and drop them if the reason for
keeping them is gone.

1. [websocket-shim.ts](../../tests/unit/_support/setup/_internal/env/collab/websocket-shim.ts)
   Reason: jsdom/Node `WebSocket` still breaks collab tests with an `Event`
   realm mismatch. Rechecked on `vitest 4.1.0` and `jsdom 29.0.0`; still
   needed.
   Revisit when: `pnpm run test:collab:full` stays green with
   `REMDO_DISABLE_COLLAB_WEBSOCKET_SHIM=1`.

2. [selection-modify-polyfill.ts](../../tests/unit/_support/setup/_internal/selection-modify-polyfill.ts)
   Reason: jsdom still does not implement `Selection.modify`.
   Revisit when: jsdom provides it natively.

3. [browser-mocks.ts](../../tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `Range.getBoundingClientRect`
   Reason: jsdom `Range` still lacks it and Lexical still calls it.
   Revisit when: jsdom implements it or Lexical stops needing it.

4. [browser-mocks.ts](../../tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `DragEvent`
   Reason: jsdom still lacks `DragEvent`, while Lexical/test code still checks
   for it.
   Revisit when: jsdom provides it or those checks disappear.

5. [browser-mocks.ts](../../tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `ClipboardEvent`
   Reason: jsdom still lacks a usable `ClipboardEvent` with `clipboardData`.
   Revisit when: jsdom provides enough native support for these tests.

## Held-Back Versions

Review these during dependency refresh work. If the blocker is gone, try the
upgrade again and rerun the full validation set.

1. `eslint` `^9.39.3`
   Held back from: `10.0.3`
   Reason: `@lexical/eslint-plugin` crashes under ESLint 10 with
   `context.getSourceCode is not a function`.
   Dependabot: ignore `>= 10.0.0 < 11.0.0` while this blocker stands.
   Revisit when: Lexical publishes ESLint 10 support.

2. `vite` `^7.3.1`
   Held back from: `8.0.0`
   Reason: [vite.shared.ts](../../vite.shared.ts) depends
   on `vite-plugin-pwa`, and `vite-plugin-pwa 1.2.0` does not support Vite 8.
   Dependabot: ignore `>= 8.0.0 < 9.0.0` while this blocker stands.
   Revisit when: `vite-plugin-pwa` supports Vite 8 cleanly.

3. `@antfu/eslint-config` `7.6.1`
   Held back from: `8.x`
   Reason: v8 currently crashes during config load in this repo from
   `antfu/react/setup` expecting a different `react-dom` plugin shape. Staying
   on the 7.x line also keeps the repo on the smaller, already-absorbed lint
   surface for refresh turns.
   Dependabot: ignore `>= 8.0.0 < 9.0.0` while this blocker stands.
   Revisit when: we are ready to do a dedicated lint-config migration.

4. `eslint-plugin-unicorn` `^63.0.0`
   Held back from: `64.0.0`
   Reason: the current `@antfu/eslint-config 7.6.1` setup is not compatible
   with `eslint-plugin-unicorn 64` in this repo, so the Antfu hold-back also
   requires keeping Unicorn on `63.x`.
   Dependabot: ignore `>= 64.0.0 < 65.0.0` while this blocker stands.
   Revisit when: the Antfu config moves to a compatible version, or we replace
   that integration.

5. `typescript` `^5.9.3`
   Held back from: `6.0.2`
   Reason: the TypeScript 6 jump still pushes the refresh beyond the skill's
   happy path due to ecosystem peer drift and follow-on tooling fallout.
   Dependabot: ignore `>= 6.0.0 < 7.0.0` while this blocker stands.
   Revisit when: we are ready to absorb the TypeScript 6 upgrade as a dedicated
   tooling pass.
