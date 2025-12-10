import type { Locator, Page } from '#editor/fixtures';

export const editorLocator = (page: Page): Locator => page.locator('.editor-container');
