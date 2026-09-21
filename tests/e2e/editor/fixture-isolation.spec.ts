import { expect, test } from '#editor/fixtures';
import { withPageGuards } from '#e2e/fixtures';
import { createEditorHarness } from './_support/runtime';

test('reuses the login with fresh browser state', async ({ page, context, editor, newWorkerContext }, testInfo) => {
  await editor.load('flat');
  await page.evaluate(() => {
    localStorage.setItem('fixture-isolation', 'previous context');
    sessionStorage.setItem('fixture-isolation', 'previous context');
  });
  await page.close();
  await context.clearCookies();

  const nextContext = await newWorkerContext();
  try {
    const nextPage = await nextContext.newPage();
    await withPageGuards(nextPage, async (guardedPage) => {
      const reopenedEditor = await createEditorHarness(guardedPage, editor.docId);
      await expect(reopenedEditor).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(await guardedPage.evaluate(() => ({
        local: localStorage.getItem('fixture-isolation'),
        session: sessionStorage.getItem('fixture-isolation'),
      }))).toEqual({ local: null, session: null });
    }, testInfo);
  } finally {
    await nextContext.close();
  }
});
