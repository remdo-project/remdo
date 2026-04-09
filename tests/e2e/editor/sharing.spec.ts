import { expect, test } from '#editor/fixtures';

test.describe('Document sharing', () => {
  test('shows the current document as unshared by default', async ({ page, editor }) => {
    // `editor` boots the standard editor harness for the current page.
    void editor;
    await expect(page.getByRole('checkbox', { name: 'Share' })).not.toBeChecked();
    await expect(page.getByText('unshared')).toBeVisible();
  });

  test('shares a document, opens it through the share link, and regenerates a new link after revoke', async ({
    context,
    page,
    captureCreatedDoc,
    editor,
  }) => {
    // `editor` boots the standard editor harness before this test creates/switches docs.
    void editor;

    const createdDocId = await captureCreatedDoc(page, async () => {
      await page.getByRole('button', { name: 'Choose document' }).click();
      await page.getByRole('option', { name: 'New', exact: true }).click();
    });

    const shareCheckbox = page.getByRole('checkbox', { name: 'Share' });
    await shareCheckbox.check();

    await expect(page.getByText('Generating')).toBeVisible();

    const sharedLink = page.getByRole('link', { name: 'shared' });
    await expect(sharedLink).toBeVisible();
    await expect(sharedLink).toHaveAttribute('target', '_blank');

    const firstHref = await sharedLink.getAttribute('href');
    expect(firstHref).toBeTruthy();

    const sharedPage = await context.newPage();
    await sharedPage.goto(firstHref!);
    await expect(sharedPage.getByRole('button', { name: createdDocId })).toBeVisible();
    await expect(sharedPage.locator('.editor-input').first()).toBeVisible();
    await sharedPage.close();

    await shareCheckbox.uncheck();
    await expect(page.getByText('unshared')).toBeVisible();
    await expect(sharedLink).toHaveCount(0);

    await shareCheckbox.check();
    const replacementLink = page.getByRole('link', { name: 'shared' });
    await expect(replacementLink).toBeVisible();

    const secondHref = await replacementLink.getAttribute('href');
    expect(secondHref).toBeTruthy();
    expect(secondHref).not.toBe(firstHref);
  });
});
