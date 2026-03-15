# Dependency Maintenance

Use this doc during dependency refresh work to review temporary workarounds and
intentionally held-back versions.

## Temporary Workarounds

Check these after dependency or runtime updates and drop them if the reason for
keeping them is gone.

1. [websocket-shim.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/collab/websocket-shim.ts)
   Reason: jsdom/Node `WebSocket` still breaks collab tests with an `Event`
   realm mismatch.
   Revisit when: `pnpm run test:collab:full` stays green with
   `REMDO_DISABLE_COLLAB_WEBSOCKET_SHIM=1`.

2. [selection-modify-polyfill.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/selection-modify-polyfill.ts)
   Reason: jsdom still does not implement `Selection.modify`.
   Revisit when: jsdom provides it natively.

3. [browser-mocks.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `Range.getBoundingClientRect`
   Reason: jsdom `Range` still lacks it and Lexical still calls it.
   Revisit when: jsdom implements it or Lexical stops needing it.

4. [browser-mocks.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `DragEvent`
   Reason: jsdom still lacks `DragEvent`, while Lexical/test code still checks
   for it.
   Revisit when: jsdom provides it or those checks disappear.

5. [browser-mocks.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/browser-mocks.ts)
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
   Revisit when: Lexical publishes ESLint 10 support.

2. `vite` `^7.3.1`
   Held back from: `8.0.0`
   Reason: [vite.shared.ts](/home/piotr/projects/remdo/vite.shared.ts) depends
   on `vite-plugin-pwa`, and `vite-plugin-pwa 1.2.0` does not support Vite 8.
   Revisit when: `vite-plugin-pwa` supports Vite 8 cleanly.

3. `@antfu/eslint-config` `7.6.1`
   Held back from: `7.7.2`
   Reason: the newer config expands the lint surface enough to push the refresh
   beyond the skill's happy path.
   Revisit when: we are ready to absorb the lint fallout as a dedicated task.

4. `vitest` `4.0.18`
   Held back from: `4.1.0`
   Reason: kept aligned with the current stable test runtime.
   Revisit when: the full unit and collab suites stay green on `4.1.x`.

5. `@vitest/ui` `4.0.18`
   Held back from: `4.1.0`
   Reason: kept aligned with `vitest`.
   Revisit when: `vitest` moves successfully.

6. `@vitest/coverage-v8` `4.0.18`
   Held back from: `4.1.0`
   Reason: kept aligned with `vitest`.
   Revisit when: `vitest` moves successfully.

7. `jsdom` `^28.1.0`
   Held back from: `29.0.0`
   Reason: kept aligned with the current stable Vitest/jsdom test runtime.
   Revisit when: the full unit and collab suites stay green on the newer stack.
