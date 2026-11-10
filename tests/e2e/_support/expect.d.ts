export {};

declare global {
  // eslint-disable-next-line vars-on-top
  var __remdoTestBridges: import('#client/editor/dev/testBridgeRegistry').TestBridgeRegistry | undefined;

  namespace PlaywrightTest {
    interface Matchers<R> {
      toMatchOutline: (expected: string) => Promise<R>;
    }
  }
}
