import type { Outline } from '#tests-common/outline';

declare global {
  // eslint-disable-next-line vars-on-top
  var __remdoTestBridges: import('#client/editor/plugins/dev/testBridgeRegistry').TestBridgeRegistry | undefined;

  namespace PlaywrightTest {
    interface Matchers<R> {
      toMatchOutline: (expected: Outline) => Promise<R>;
    }
  }
}
