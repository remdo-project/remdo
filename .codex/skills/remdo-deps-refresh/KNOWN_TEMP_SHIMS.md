# Known Temp Shims

Check these after dependency or runtime updates and drop them if the assumption is no longer true.

1. [tests/unit/_support/setup/_internal/env/collab/websocket-shim.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/collab/websocket-shim.ts)
   Assumption: jsdom/Node WebSocket still breaks collab tests with an Event realm mismatch.
   Drop when: `pnpm run test:collab:full` stays green with `REMDO_DISABLE_COLLAB_WEBSOCKET_SHIM=1`.

2. [tests/unit/_support/setup/_internal/selection-modify-polyfill.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/selection-modify-polyfill.ts)
   Assumption: jsdom still does not implement `Selection.modify`.
   Drop when: jsdom provides it natively.

3. [tests/unit/_support/setup/_internal/env/browser-mocks.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `Range.getBoundingClientRect`
   Assumption: jsdom `Range` still lacks it and Lexical still calls it.
   Drop when: jsdom implements it or Lexical stops needing it.

4. [tests/unit/_support/setup/_internal/env/browser-mocks.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `DragEvent`
   Assumption: jsdom still lacks `DragEvent`, while Lexical/test code still checks for it.
   Drop when: jsdom provides it or those checks disappear.

5. [tests/unit/_support/setup/_internal/env/browser-mocks.ts](/home/piotr/projects/remdo/tests/unit/_support/setup/_internal/env/browser-mocks.ts)
   `ClipboardEvent`
   Assumption: jsdom still lacks a usable `ClipboardEvent` with `clipboardData`.
   Drop when: jsdom provides enough native support for these tests.
