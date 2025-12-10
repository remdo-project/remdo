import { expect, test as base } from '../../_support/fixtures';
import type { Locator, Page } from '../../_support/fixtures';
import { prepareEditorTestSurface } from './focus';

export const test = base.extend({
  editor: async ({ editor, page }, use) => {
    await prepareEditorTestSurface(page);
    await use(editor);
  },
});

export { expect };
export type { Page, Locator };
