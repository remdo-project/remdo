import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';
import { captureEditorSnapshot } from '#editor/state';

test.describe('deletion (native browser behavior)', () => {
  test('forward Delete at caret removes leading character of first note', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1');

    await page.keyboard.press('Delete');

    await expect(editor).toMatchOutline(`
      - ote1
          - id:: note1
      - note2
      - note3
    `);
  });

  test('Backspace in the middle of a note deletes the previous character', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 2);

    await page.keyboard.press('Backspace');

    await expect(editor).toMatchOutline(`
      - nte1
          - id:: note1
      - note2
      - note3
    `);

    const snapshot = await captureEditorSnapshot(page);
    expect(snapshot.selection).toMatchObject({
      anchorText: 'nte1',
      anchorOffset: 1,
      focusText: 'nte1',
      focusOffset: 1,
      isCollapsed: true,
    });
  });

  test('Backspace at start of first note is a no-op', async ({ page, editor }) => {
    await editor.load('basic');
    await setCaretAtText(page, 'note1');
    const before = await captureEditorSnapshot(page);

    await page.keyboard.press('Backspace');

    expect(await captureEditorSnapshot(page)).toEqual(before);
  });

  test('Backspace at start of parent with children merges and reparents', async ({ page, editor }) => {
    await editor.load('tree');
    await setCaretAtText(page, 'note2');

    await page.keyboard.press('Backspace');

    await expect(editor).toMatchOutline(`
      - note1 note2
          - id:: note1
          - note3
    `);
  });

  test('Backspace merges a leaf into its previous sibling', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note2');

    await page.keyboard.press('Backspace');

    await expect(editor).toMatchOutline(`
      - note1 note2
          - id:: note1
      - note3
    `);
  });

  test('Delete at end merges next leaf', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    await expect(editor).toMatchOutline(`
      - note1 note2
          - id:: note1
      - note3
    `);
  });

  test('Delete respects spacing when right fragment already starts with space', async ({ page, editor }) => {
    await editor.load('edge-spaces');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    await expect(editor).toMatchOutline(`
      - note1 note2SpaceLeft
          - id:: note1
      - note3
      - note4SpaceRight&#32;
          - id:: note4SpaceRight
      - note5
    `);
  });

  test('Delete respects spacing when left fragment already ends with space', async ({ page, editor }) => {
    await editor.load('edge-spaces');
    await setCaretAtText(page, 'note4SpaceRight', Number.POSITIVE_INFINITY);

    await page.keyboard.press('Delete');

    await expect(editor).toMatchOutline(`
      - note1
      - &#32;note2SpaceLeft
          - id:: note2SpaceLeft
      - note3
      - note4SpaceRight note5
          - id:: note4SpaceRight
    `);
  });

  test('Delete removes a note range and focuses the next sibling', async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1');

    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    await page.keyboard.press('Delete');

    await expect(editorLocator(page).locator('li.list-item')).toHaveCount(2);
    await expect(editor).toMatchOutline(`
      - note2
      - note3
    `);
  });
});
