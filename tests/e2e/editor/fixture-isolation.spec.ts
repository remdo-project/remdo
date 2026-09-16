import { expect, test } from '#editor/fixtures';

test.describe('Worker authentication isolation', () => {
  test.describe.configure({ mode: 'serial' });

  let firstUser: unknown;
  let firstDocumentId: string;

  test('allows a test to change its browser state', async ({ page, context, editor }) => {
    firstUser = await (await page.request.get('/api/current-user', { failOnStatusCode: true })).json();
    firstDocumentId = editor.docId;
    await page.evaluate(() => {
      localStorage.setItem('fixture-isolation', 'previous test');
      sessionStorage.setItem('fixture-isolation', 'previous test');
    });
    await page.close();
    await context.clearCookies();
  });

  test('reuses the login with fresh browser state and a separate document', async ({ page, editor }) => {
    const user = await (await page.request.get('/api/current-user', { failOnStatusCode: true })).json();
    expect(user).toEqual(firstUser);
    expect(editor.docId).not.toBe(firstDocumentId);
    expect(await page.evaluate(() => ({
      local: localStorage.getItem('fixture-isolation'),
      session: sessionStorage.getItem('fixture-isolation'),
    }))).toEqual({ local: null, session: null });
  });
});
