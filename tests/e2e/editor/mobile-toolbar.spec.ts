import { expect, test } from '#editor/fixtures';

test.describe('Mobile action toolbar', () => {
  test.use({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), {
        height: 844,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        width: 390,
      });
      Object.defineProperty(globalThis, 'visualViewport', {
        configurable: true,
        value: viewport,
      });
    });
  });

  test('stays on the visual viewport edge when the keyboard changes window geometry', async ({
    page,
    editor,
  }) => {
    await editor.load('flat');

    const toolbar = page.getByRole('toolbar', { name: 'Note actions' });
    await expect(toolbar).toBeVisible();
    await expect.poll(() => toolbar.evaluate((element) => element.getBoundingClientRect().bottom))
      .toBe(844);

    await page.evaluate(() => {
      // iOS may report innerHeight as the already-shrunken window while fixed
      // positioning remains tied to the taller layout viewport. The toolbar
      // must follow the visual viewport's lower edge directly: 120 + 480 = 600.
      Object.defineProperty(globalThis, 'innerHeight', {
        configurable: true,
        value: 600,
      });
      Object.assign(globalThis.visualViewport!, {
        height: 480,
        offsetTop: 120,
      });
      globalThis.visualViewport!.dispatchEvent(new Event('resize'));
    });

    await expect.poll(() => toolbar.evaluate((element) => element.getBoundingClientRect().bottom))
      .toBe(600);
  });
});
