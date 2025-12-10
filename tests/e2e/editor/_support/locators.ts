import type { Locator, Page } from '../../_support/fixtures';

export const editorLocator = (page: Page): Locator => page.locator('.editor-container');
