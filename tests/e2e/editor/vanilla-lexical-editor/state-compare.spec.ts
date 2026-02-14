import { expect, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { editorLocator, setCaretAtText } from '#editor/locators';

const REMDO_TREE_SELECTOR = '.editor-tree-view-body pre';
const VANILLA_INPUT_SELECTOR = '.vanilla-lexical-input';
const VANILLA_TREE_SELECTOR = '.vanilla-lexical-tree-body pre';

const stringifyWithoutNoteIds = (value: unknown) =>
  JSON.stringify(value, (key, val) => (key === 'noteId' ? undefined : val), 2);

async function getEditorStateFromSelector(page: Page, selector: string, label: string): Promise<unknown> {
  return page.evaluate(
    ({ target, labelText }) => {
      const element = document.querySelector(target) as { __lexicalEditor?: { getEditorState: () => { toJSON: () => unknown } } } | null;
      if (!element?.__lexicalEditor) {
        throw new Error(`${labelText} editor not found.`);
      }
      return element.__lexicalEditor.getEditorState().toJSON();
    },
    { target: selector, labelText: label }
  );
}

async function typeBaseNotes(page: Page, inputSelector: string): Promise<void> {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new TypeError(`Input ${selector} not found.`);
    }
    element.focus();
  }, inputSelector);

  await page.keyboard.type('note1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('note2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('note3');
}

async function setVanillaCaretToTextStart(page: Page, label: string): Promise<void> {
  await page.evaluate(
    ({ selector, text }) => {
      const root = document.querySelector(selector);
      if (!(root instanceof HTMLElement)) {
        throw new TypeError(`Input ${selector} not found.`);
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let target: Text | null = null;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const content = node.textContent;
        if (content.includes(text)) {
          target = node;
          break;
        }
      }

      if (target === null) {
        throw new TypeError(`Text "${text}" not found.`);
      }

      const selection = globalThis.getSelection();
      if (selection === null) {
        throw new Error('No selection available');
      }

      const textContent = target.textContent;
      const labelIndex = textContent.indexOf(text);
      if (labelIndex === -1) {
        throw new TypeError(`Text "${text}" not found in node.`);
      }

      const range = document.createRange();
      range.setStart(target, labelIndex);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    },
    { selector: VANILLA_INPUT_SELECTOR, text: label }
  );
}

test('compares RemDo vs vanilla state after user-level indentation', async ({ page }) => {
  const docId = createUniqueNoteId();
  await page.goto(`/n/${docId}?lexicalDemo=true`);

  await page.waitForSelector(VANILLA_TREE_SELECTOR);
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await page.waitForFunction(
    (selector) => {
      const element = document.querySelector(selector) as { __lexicalEditor?: unknown } | null;
      return Boolean(element?.__lexicalEditor);
    },
    REMDO_TREE_SELECTOR
  );

  const remdoInput = editorLocator(page).locator('.editor-input').first();
  await remdoInput.waitFor();
  await remdoInput.click();
  await typeBaseNotes(page, '.editor-input');
  await setCaretAtText(page, 'note2', 0);
  await page.keyboard.press('Tab');

  await page.waitForSelector(VANILLA_INPUT_SELECTOR);
  await typeBaseNotes(page, VANILLA_INPUT_SELECTOR);
  await setVanillaCaretToTextStart(page, 'note2');
  await page.keyboard.press('Tab');

  const remdoState = await getEditorStateFromSelector(page, REMDO_TREE_SELECTOR, 'RemDo');
  const vanillaState = await getEditorStateFromSelector(page, VANILLA_TREE_SELECTOR, 'Vanilla Lexical');

  expect(stringifyWithoutNoteIds(remdoState)).toMatchSnapshot('remdo-nested-list.json');
  expect(stringifyWithoutNoteIds(vanillaState)).toMatchSnapshot('vanilla-nested-list.json');
});
