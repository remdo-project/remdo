import type { Locator, Page } from '#editor/fixtures';

export const editorLocator = (page: Page): Locator => page.locator('.editor-container');
export const zoomBreadcrumbs = (page: Page): Locator => page.locator('[data-zoom-breadcrumbs]');
export const documentZoomBreadcrumb = (page: Page): Locator => zoomBreadcrumbs(page).locator('[data-zoom-crumb="document"]');
export const homeZoomBreadcrumb = (page: Page): Locator => zoomBreadcrumbs(page).locator('[data-zoom-crumb="home"]');
export const homeView = (page: Page): Locator => page.locator('[data-testid="document-home"]');

export async function setCaretAtText(
  page: Page,
  label: string,
  offset: number | typeof Number.POSITIVE_INFINITY = 0
): Promise<void> {
  const text = editorLocator(page).locator('[data-lexical-text="true"]').filter({ hasText: label }).first();
  const inputHandle = await text.evaluateHandle((el) => el.closest('.editor-input'));
  const input = inputHandle.asElement()!;
  await input.evaluate((el) => {
    if (el instanceof HTMLElement) {
      el.focus();
    }
  });
  await text.evaluate((el, off) => {
    const target = el.firstChild ?? el;
    const length = target.textContent?.length ?? 0;
    const resolved =
      off === Number.POSITIVE_INFINITY
        ? length
        : Math.min(Math.max(typeof off === 'number' ? off : 0, 0), length);

    const selection = globalThis.getSelection();
    if (!selection) throw new Error('No selection available');
    const range = document.createRange();
    range.setStart(target, resolved);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, offset);
  await page.waitForFunction(
    ({ input, expected }) => {
      const sel = globalThis.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const anchorNode = sel.anchorNode;
      if (!anchorNode || !input.contains(anchorNode)) return false;
      const textContent = anchorNode.textContent ?? '';
      return textContent.includes(expected);
    },
    { input, expected: label }
  );
  await input.dispose();
}

export async function selectInlineRange(page: Page, label: string, startOffset: number, endOffset: number): Promise<void> {
  const start = Math.min(startOffset, endOffset);
  const end = Math.max(startOffset, endOffset);
  if (start === end) {
    await setCaretAtText(page, label, start);
    return;
  }

  const text = editorLocator(page).locator('[data-lexical-text="true"]').filter({ hasText: label }).first();
  const inputHandle = await text.evaluateHandle((el) => el.closest('.editor-input'));
  const input = inputHandle.asElement()!;
  const expectedText = label.slice(start, end);
  await input.evaluate((el) => {
    if (el instanceof HTMLElement) {
      el.focus();
    }
  });
  await text.evaluate((el, offsets) => {
    const target = el.firstChild;
    if (!(target instanceof Text)) {
      throw new TypeError('Expected inline selection target to be a text node');
    }
    const length = target.length;
    const resolvedStart = Math.min(Math.max(offsets.start, 0), length);
    const resolvedEnd = Math.min(Math.max(offsets.end, 0), length);

    const selection = globalThis.getSelection();
    if (!selection) throw new Error('No selection available');
    const range = document.createRange();
    range.setStart(target, resolvedStart);
    range.setEnd(target, resolvedEnd);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, { start, end });

  await page.waitForFunction(
    ({ input, expectedText }) => {
      const sel = globalThis.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;
      if (!anchorNode || !focusNode || !input.contains(anchorNode) || !input.contains(focusNode)) {
        return false;
      }
      const range = sel.getRangeAt(0);
      return range.toString() === expectedText;
    },
    { input, expectedText }
  );
  await input.dispose();
}

export async function setCaretAtNoteTextNode(
  page: Page,
  noteText: string,
  textNodeIndex: number,
  offset: number
): Promise<void> {
  const input = editorLocator(page).locator('.editor-input').first();
  await input.evaluate((element, args) => {
    if (element instanceof HTMLElement) {
      element.focus();
    }
    const items = Array.from(element.querySelectorAll('li'));
    const match = items.find((item) => item.textContent === args.noteText)!;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(match, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        nodes.push(current as Text);
      }
      current = walker.nextNode();
    }
    const target = nodes[args.textNodeIndex]!;
    const length = target.length;
    const clamped = Math.max(0, Math.min(args.offset, length));
    const selection = globalThis.getSelection();
    if (!selection) throw new Error('No selection available');
    const range = document.createRange();
    range.setStart(target, clamped);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, { noteText, textNodeIndex, offset });
  await page.waitForFunction(
    ({ noteText }) => {
      const sel = globalThis.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const anchor = sel.anchorNode;
      let item: Element | null = null;
      if (anchor instanceof Element) {
        item = anchor.closest('li');
      } else if (anchor && anchor.parentElement) {
        item = anchor.parentElement.closest('li');
      }
      return Boolean(item && item.textContent === noteText);
    },
    { noteText }
  );
}
