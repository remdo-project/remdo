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

1. `vite` `^7.3.1`
   Held back from: `8.0.0`
   Reason: [vite.shared.ts](../../vite.shared.ts) depends
   on `vite-plugin-pwa`, and `vite-plugin-pwa 1.2.0` does not support Vite 8.
   Dependabot: ignore `>= 8.0.0 < 9.0.0` while this blocker stands.
   Revisit when: `vite-plugin-pwa` supports Vite 8 cleanly.

2. `@eslint-react/eslint-plugin` `^3.0.0`
   Held back from: `4.2.3`
   Reason: `@antfu/eslint-config` `8.0.0` still peers
   `@eslint-react/eslint-plugin ^3.0.0`, and the 4.x line crashes config load
   through `antfu/react/setup` with `Key "plugins": Key "react-dom":
   Expected an object.`
   Dependabot: ignore `>= 4.0.0 < 5.0.0` while this blocker stands.
   Revisit when: Antfu supports `@eslint-react/eslint-plugin` 4.x cleanly, or
   the repo replaces/adapts that config layer.
