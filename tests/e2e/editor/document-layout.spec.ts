import { expect, isolatedTest as test } from '#editor/fixtures';
import { editorLocator } from '#editor/locators';

test.describe('Document layout', () => {
  test('sets outline rows 32px apart and indents nested notes by 32px', async ({ page, editor }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await editor.load('tree');
    const textBox = async (name: string) => (await editorLocator(page).locator('[data-lexical-text="true"]', { hasText: name }).first().boundingBox())!;
    const [note1, note2, note3] = [await textBox('note1'), await textBox('note2'), await textBox('note3')];

    expect(note2.y - note1.y).toBeCloseTo(32, 0);
    expect(note3.y - note2.y).toBeCloseTo(32, 0);
    expect(note3.x - note2.x).toBeCloseTo(32, 0);
  });
});
