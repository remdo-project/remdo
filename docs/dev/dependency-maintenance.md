# Dependency Maintenance

Use this doc during dependency refresh work to review temporary workarounds and
intentionally held-back versions.

## Temporary Workarounds

Check these after dependency or runtime updates and drop them if the reason for
keeping them is gone.

1. [websocket-shim.ts](../../tests/unit/_support/setup/_internal/env/collab/websocket-shim.ts)
   Reason: jsdom/Node `WebSocket` still breaks collab tests with an `Event`
   realm mismatch. Rechecked on `vitest 4.1.9` and `jsdom 29.1.1`; still
   needed because disabling it causes broad collab-suite timeouts.
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

6. `vite-plugin-pwa` peer `workbox-build@^7.4.1`
   Reason: adding `workbox-build 7.4.1` directly fails pnpm trust policy
   because `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1` has a
   provenance trust downgrade. Keep the peer warning rather than weakening the
   workspace trust policy.
   Revisit when: the peer can be satisfied without a trust downgrade.

## Held-Back Versions

Review these during dependency refresh work. If the blocker is gone, try the
upgrade again and rerun the full validation set.

None currently.
