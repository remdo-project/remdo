import type { Outline } from '#tests-common/outline';

declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      toMatchOutline: (expected: Outline) => Promise<R>;
    }
  }
}
