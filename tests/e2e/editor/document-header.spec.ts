import { expect, isolatedTest as test } from '#editor/fixtures';
import { documentShell, editorLocator, homeView } from '#editor/locators';
import { openNoteMenu } from './_support/menu';
import { waitForSynced } from './_support/bridge';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document-root header', () => {
  test('shares the menu target with the note strip so one button shows at a time', async ({ page, editor }) => {
    await editor.load('tree-complex');
    const headerButton = page.getByRole('button', { name: /^Actions for/u });
    const noteButton = editorLocator(page).locator('.note-controls__button--menu');

    await page.getByRole('heading', { level: 1 }).hover();
    await expect(headerButton).toHaveCSS('opacity', '1');
    await expect(noteButton).toBeHidden();
    await expect(editorLocator(page).locator('.note-controls__button--expanded')).toBeVisible();

    await editorLocator(page).locator('[data-lexical-text="true"]', { hasText: 'note2' }).first().hover();
    await expect(noteButton).toBeVisible();
    await expect(headerButton).toHaveCSS('opacity', '0');
  });

  test('keeps the header target while the pointer crosses blank editor space', async ({ page, editor }) => {
    await editor.load('tree-complex');
    const headerButton = page.getByRole('button', { name: /^Actions for/u });
    const box = (await editorLocator(page).locator('.editor-input').boundingBox())!;

    await page.getByRole('heading', { level: 1 }).hover();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);

    await expect(headerButton).toHaveCSS('opacity', '1');
    await expect(editorLocator(page).locator('.note-controls__button--menu')).toBeHidden();
  });

  test('moves the menu target to the note strip when the pointer reaches a note through the gutter', async ({ page, editor }) => {
    await editor.load('tree-complex');
    const headerButton = page.getByRole('button', { name: /^Actions for/u });
    const container = (await editorLocator(page).boundingBox())!;
    const note5 = (await editorLocator(page).locator('[data-lexical-text="true"]', { hasText: 'note5' }).boundingBox())!;

    const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!;

    await page.getByRole('heading', { level: 1 }).hover();
    await page.mouse.move(container.x + 8, heading.y + heading.height / 2);
    await page.mouse.move(container.x + 8, note5.y + note5.height / 2, { steps: 8 });

    await expect(editorLocator(page).locator('.note-controls__button--menu')).toBeVisible();
    await expect(headerButton).toHaveCSS('opacity', '0');
  });

  test('keeps the target of an open note menu when the pointer reaches the header', async ({ page, editor }) => {
    await editor.load('tree-complex');
    const menu = await openNoteMenu(page, 'note2');

    await page.getByRole('heading', { level: 1 }).hover();

    await menu.expectOpen();
    await expect(documentShell(page)).toHaveAttribute('data-menu-target', 'note');
  });

  test('returns the menu target to the note strip on editor focus and typing', async ({ page, editor }) => {
    await editor.load('tree-complex');
    const heading = page.getByRole('heading', { level: 1 });
    const headerButton = page.getByRole('button', { name: /^Actions for/u });
    const noteButton = editorLocator(page).locator('.note-controls__button--menu');
    const input = editorLocator(page).locator('.editor-input');

    await input.evaluate((element) => { element.blur(); });
    await heading.hover();
    await expect(headerButton).toHaveCSS('opacity', '1');
    await input.focus();
    await expect(noteButton).toBeVisible();
    await expect(headerButton).toHaveCSS('opacity', '0');

    await page.mouse.move(0, 0);
    await heading.hover();
    await expect(headerButton).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowDown');
    await expect(noteButton).toBeVisible();
    await expect(headerButton).toHaveCSS('opacity', '0');
  });

  test('renames the document from its menu and restores focus to the button', async ({ page, editor }) => {
    await editor.load('basic');
    const heading = page.getByRole('heading', { level: 1 });
    const initialName = await heading.innerText();
    const trigger = page.getByRole('button', { name: `Actions for ${initialName}` });

    await heading.hover();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByRole('textbox', { name: 'Document name' }).fill('Renamed header');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(heading).toHaveText('Renamed header');
    await expect(page.getByRole('button', { name: 'Actions for Renamed header' })).toBeFocused();
  });

  test('Zoom out from the header menu opens Home', async ({ page, editor }) => {
    await editor.load('tree-complex');

    await page.getByRole('heading', { level: 1 }).hover();
    await page.getByRole('button', { name: /^Actions for/u }).click();
    await page.getByRole('menuitem', { name: 'Zoom out' }).click();

    await expect(page).toHaveURL('/');
    await expect(homeView(page).getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
  });

  test('keeps the note strip available when history navigation zooms past the header', async ({ page, editor }) => {
    await editor.load('tree-complex');
    await page.getByRole('heading', { level: 1 }).hover();

    await page.evaluate((path) => {
      globalThis.history.pushState({}, '', path);
      globalThis.dispatchEvent(new PopStateEvent('popstate'));
    }, createEditorDocumentPath(editor.docId, 'note2'));
    await expect(page).toHaveURL(/note2$/u);
    await waitForSynced(page);
    await page.mouse.move(0, 0);

    await expect(editorLocator(page).locator('.note-controls__button--menu')).toBeVisible();
  });

  test('folds the document to a level from the menu accelerator', async ({ page, editor }) => {
    await editor.load('tree-complex');

    await page.getByRole('heading', { level: 1 }).hover();
    await page.getByRole('button', { name: /^Actions for/u }).click();
    await page.keyboard.press('1');

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(editor).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [
          {
            noteId: 'note2',
            text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      {
        noteId: 'note6',
        text: 'note6',
        folded: true,
        children: [{ noteId: 'note7', text: 'note7' }],
      },
    ]);
  });
});
