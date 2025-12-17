import type { ConsoleMessage, Page, Response } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import type { Outline } from '#tests-common/outline';
import { extractOutlineFromEditorState } from '#tests-common/outline';

interface EditorLike {
  getEditorState: () => Promise<unknown>;
}

function attachGuards(page: Page) {
  const allowResponse = (response: Response) => {
    const url = response.url();
    if (url.startsWith('data:')) return true;
    if (url.includes('favicon') && response.status() === 404) return true;
    return false;
  };

  const onConsole = (message: ConsoleMessage) => {
    const type = message.type();
    if (type === 'warning' || type === 'error') {
      throw new Error(`console.${type}: ${message.text()}`);
    }
  };

  const onResponse = (response: Response) => {
    const status = response.status();
    if (status >= 400 && !allowResponse(response)) {
      throw new Error(`response ${status}: ${response.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  return () => {
    page.off('console', onConsole);
    page.off('response', onResponse);
  };
}

export const test = base.extend({
  page: async ({ page }, apply) => {
    const detach = attachGuards(page);
    await apply(page);
    detach();
  },
});

expect.extend({
  async toMatchOutline(received: unknown, expected: Outline) {
    if (this.isNot) {
      return {
        pass: true,
        message: () => 'expect(...).not.toMatchOutline(...) is not supported; assert a positive outline instead.',
      };
    }

    const target = received as Partial<EditorLike> | null;
    if (!target || typeof target.getEditorState !== 'function') {
      return {
        pass: false,
        message: () => 'Expected a target with getEditorState(): Promise<unknown>.',
      };
    }

    const outline = async () => extractOutlineFromEditorState(await target.getEditorState!());

    try {
      await expect.poll(outline).toEqual(expected);
      return { pass: true, message: () => 'Expected outlines not to match.' };
    } catch (error) {
      return {
        pass: false,
        message: () => (error instanceof Error ? error.message : String(error)),
      };
    }
  },
});

export { expect };
export type { Page, Locator } from '@playwright/test';
