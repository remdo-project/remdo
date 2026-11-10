import { expect, test } from '#editor/fixtures';

test.describe('normalization (load)', () => {
  test('repairs an orphan wrapper and preserves expected outline', async ({ editor }) => {
    await editor.load('editor-schema/wrapper-orphan');

    await expect(editor).toMatchOutline(`
      - note1-child-of-orphaned-wrapper
          - id:: note1
      - note3-root-2nd-child
          - id:: note3
    `);
  });
});
