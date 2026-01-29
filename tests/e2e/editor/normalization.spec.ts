import { expect, test } from '#editor/fixtures';

test.describe('normalization (load)', () => {
  test('repairs an orphan wrapper and preserves expected outline', async ({ editor }) => {
    await editor.load('editor-schema/wrapper-orphan', {
      expectedConsoleIssues: [
        'runtime.invariant wrapper-without-sibling path=root',
        'runtime.invariant orphan-wrapper-without-previous-content',
      ],
    });

    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1-child-of-orphaned-wrapper' },
      { noteId: 'note3', text: 'note3-root-2nd-child' },
    ]);
  });
});
