import type { Outline } from '#tests-common/outline';
import type { RemdoTestApi } from '@/editor/plugins/dev';

declare global {
  // eslint-disable-next-line vars-on-top
  var __remdoBridgePromise: Promise<RemdoTestApi> | undefined;

  namespace PlaywrightTest {
    interface Matchers<R> {
      toMatchOutline: (expected: Outline) => Promise<R>;
    }
  }
}
