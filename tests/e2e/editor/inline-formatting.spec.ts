import type { SerializedListItemNode, SerializedListNode } from '@lexical/list';
import type { SerializedLinkNode } from '@lexical/link';
import type { SerializedTextNode } from 'lexical';
import type { Locator, Page } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { datePickerPanel, editorLocator, homeZoomBreadcrumb, noteRow, selectInlineRange, setCaretAtText } from '#editor/locators';
import { ensureReady, waitForSynced } from '#editor/bridge';
import { createEditorDocumentPath } from './_support/routes';

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Text formatting' });
const input = (page: Page) => editorLocator(page).locator('.editor-input');
const selectedText = (page: Page) => page.evaluate(() => document.getSelection()!.toString());
const wrappedText = 'Select a phrase to format it, keep the selection for repeated actions, and try '
  + 'the compact row at narrow widths. This deliberately long note wraps across '
  + 'several lines so placement remains visible near the top edge of a clipped '
  + 'editing area.';

const nativeRange = (page: Page) => page.evaluate(() => {
  const selection = document.getSelection()!;
  const anchor = document.createRange();
  const focus = document.createRange();
  anchor.setStart(selection.anchorNode!, selection.anchorOffset);
  anchor.collapse(true);
  focus.setStart(selection.focusNode!, selection.focusOffset);
  focus.collapse(true);
  return { text: selection.toString(), collapsed: selection.isCollapsed,
    backward: anchor.compareBoundaryPoints(Range.START_TO_START, focus) > 0 };
});

async function nativeSelectionLayout(page: Page) {
  return input(page).evaluate(element => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    return {
      bounds: { left, right, top, bottom },
      lines: Array.from(document.getSelection()!.getRangeAt(0).getClientRects())
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map(({ left, right, top, bottom }) => ({ left, right, top, bottom })),
    };
  });
}

async function label(page: Page, text: string) {
  await page.evaluate(async text => {
    await globalThis.__remdoTestBridges!.list()[0]!.updateNoteText('note1', text);
  }, text);
}

// Native selection across independently formatted DOM runs. Offsets count only
// this declared region's text, so chrome and structural wrappers cannot anchor it.
async function selectRegion(page: Page, region: Locator, from: number, to: number) {
  await input(page).focus();
  await region.evaluate((element, { from, to }) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    const point = (offset: number): [Text, number] => {
      for (const node of nodes) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      throw new Error('Selection offset exceeds the declared fixture region');
    };
    const [anchor, anchorOffset] = point(from);
    const [focus, focusOffset] = point(to);
    document.getSelection()!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
    document.dispatchEvent(new Event('selectionchange'));
  }, { from, to });
}

async function richLabel(page: Page) {
  await page.evaluate(async () => {
    const api = globalThis.__remdoTestBridges!.list()[0]!;
    const state = api.getEditorState();
    const list = state.root.children[0] as SerializedListNode;
    const note = list.children[0] as SerializedListItemNode;
    const plain = note.children[0] as SerializedTextNode;
    const linkText: SerializedTextNode = { ...plain, text: ' link' };
    const children: (SerializedTextNode | SerializedLinkNode)[] = [
      { ...plain, text: 'before ' },
      { ...plain, text: 'bold', format: 1, style: 'color: rgb(230, 80, 90);' },
      { type: 'link', version: 1, url: 'https://example.com/', target: '_blank', rel: 'noopener noreferrer',
        title: null, direction: null, format: '', indent: 0, children: [linkText] },
      { ...plain, text: ' after' },
    ];
    note.children = children;
    await api._bridge.applySerializedState(JSON.stringify(state));
  });
}

test('formats only the selected phrase, retains the range for repeated actions, and isolates undo steps', async ({ page, editor }) => {
  await editor.load('flat');
  await label(page, 'before selected after');
  await selectInlineRange(page, 'before selected after', 7, 15);
  await expect(toolbar(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect(toolbar(page).getByRole('button')).toHaveCount(4);
  for (const name of ['Bold', 'Italic', 'Underline', 'Inline code']) {
    const button = toolbar(page).getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => selectedText(page)).toBe('selected');
    await expect(input(page)).toBeFocused();
  }
  const row = noteRow(page, 'before selected after');
  await expect(row.locator('.text-bold.text-italic.text-underline.text-code')).toHaveText('selected');
  await expect(row.locator('[data-lexical-text=true]').first()).toHaveText('before ');
  await expect(row.locator('[data-lexical-text=true]').last()).toHaveText(' after');
  await expect(row.locator('[data-lexical-text=true]').first()).not.toHaveClass(/text-bold|text-code/u);
  await expect(row.locator('[data-lexical-text=true]').last()).not.toHaveClass(/text-italic|text-underline/u);
  const bold = toolbar(page).getByRole('button', { name: 'Bold', exact: true });
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row.locator('.text-bold')).toHaveCount(0);
  await expect(row.locator('.text-code')).toHaveText('selected');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row.locator('.text-bold')).toHaveText('selected');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row.locator('.text-code')).toHaveCount(0);
  await expect(row.locator('.text-bold.text-italic.text-underline')).toHaveText('selected');
  await waitForSynced(page);
  await page.reload();
  await waitForSynced(page);
  await expect(noteRow(page, 'before selected after').locator('.text-bold.text-italic.text-underline')).toHaveText('selected');
});

test('sets a backward mixed range uniformly on, toggles off, and preserves links, styles and direction', async ({ page, editor }) => {
  await editor.load('flat');
  await richLabel(page);
  const row = noteRow(page, 'before bold link after');
  await selectRegion(page, row, 16, 7);
  await expect(toolbar(page)).toBeVisible();
  const bold = toolbar(page).getByRole('button', { name: 'Bold', exact: true });
  await expect(bold).toHaveAttribute('aria-pressed', 'mixed');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('.text-bold')).toHaveText(['bold', ' link']);
  await expect.poll(() => nativeRange(page)).toEqual({ text: 'bold link', collapsed: false, backward: true });
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await expect(row.locator('.text-bold')).toHaveCount(0);
  await expect(row.getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://example.com/');
  await expect(row.locator('[style]')).toHaveCSS('color', 'rgb(230, 80, 90)');
  await expect(row).toHaveText('before bold link after');
});

test('keeps formatting shortcuts in the editor and leaves Alt+F10 unclaimed', async ({ page, editor }) => {
  await editor.load('flat');
  await selectInlineRange(page, 'note2', 1, 4);
  await expect(toolbar(page)).toBeVisible();
  await input(page).evaluate(element => {
    element.addEventListener('keydown', event => {
      if (event instanceof KeyboardEvent && event.key === 'F10') {
        queueMicrotask(() => element.setAttribute('data-f10-prevented', String(event.defaultPrevented)));
      }
    });
  });
  await page.keyboard.press('Alt+F10');
  await expect(input(page)).toHaveAttribute('data-f10-prevented', 'false');
  await expect(input(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe('ote');
  for (const [name, key] of [['Bold', 'b'], ['Italic', 'i'], ['Underline', 'u'], ['Inline code', 'e']]) {
    await page.keyboard.press(`ControlOrMeta+${key}`);
    await expect(toolbar(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(input(page)).toBeFocused();
    await expect.poll(() => selectedText(page)).toBe('ote');
  }
  const code = toolbar(page).getByRole('button', { name: 'Inline code' });
  await expect(code).toHaveAttribute('aria-keyshortcuts', 'Control+E');
  await expect(code.locator('[title]')).toHaveAttribute('title', 'Inline code (Ctrl+E)');
  await page.keyboard.press('Tab');
  await expect(input(page).locator('.list-nested-item')).toHaveCount(1);
  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1', children: [{ noteId: 'note2', text: 'note2' }] },
    { noteId: 'note3', text: 'note3' },
  ]);
});

for (const mac of [false, true]) {
  test(`uses the advertised Inline code shortcut on ${mac ? 'macOS' : 'Windows/Linux'}`, async ({ page, editor }) => {
    if (mac) {
      await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }));
      await page.reload();
      await waitForSynced(page);
    }
    await editor.load('flat');
    await page.getByRole('button', { name: 'Keyboard reference' }).click();
    const reference = page.getByRole('dialog', { name: 'Keyboard reference' });
    const keys = await reference.getByText('Inline code', { exact: true }).locator('xpath=..').locator('kbd')
      .evaluateAll(caps => caps.map(cap => cap.querySelector('[aria-hidden]')?.textContent ?? cap.textContent));
    expect(keys).toEqual([mac ? '⌘' : 'Ctrl', 'E']);
    await expect(reference.getByText('Text formatting', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await selectInlineRange(page, 'note1', 1, 4);
    const code = toolbar(page).getByRole('button', { name: 'Inline code' });
    await expect(code).toHaveAttribute('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+E`);
    await expect(code.locator('[title]')).toHaveAttribute('title', `Inline code (${mac ? '⌘' : 'Ctrl'}+E)`);
    for (const modifiers of [
      { metaKey: !mac, ctrlKey: mac },
      { metaKey: mac, ctrlKey: !mac, shiftKey: true },
      { metaKey: mac, ctrlKey: !mac, altKey: true },
      { metaKey: true, ctrlKey: true },
    ]) {
      await input(page).dispatchEvent('keydown', { key: 'e', ...modifiers });
      await expect(code).toHaveAttribute('aria-pressed', 'false');
    }
    await page.keyboard.press(`${keys[0] === '⌘' ? 'Meta' : 'Control'}+${keys[1]}`);
    await expect(code).toHaveAttribute('aria-pressed', 'true');
    await expect(noteRow(page, 'note1').locator('.text-code')).toHaveText('ote');
    await expect(input(page)).toBeFocused();
    await expect.poll(() => selectedText(page)).toBe('ote');
  });
}

test('formats full body text and editable location-header text while preserving editor-side Escape behavior', async ({ page, editor }) => {
  await editor.load('tree-complex');
  await setCaretAtText(page, 'note1', 5);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('first line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(toolbar(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__remdoTestBridges!.list()[0]!.editor.selection.get())).toBeNull();
  await toolbar(page).getByRole('button', { name: 'Underline', exact: true }).click();
  await expect(input(page).locator('.note-body .text-underline')).toHaveText(['first line', 'second line']);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.note-body .text-code.text-underline')).toHaveText(['first line', 'second line']);
  await expect(input(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe('first line\nsecond line');
  await page.keyboard.press('Escape');
  await expect(toolbar(page)).toHaveCount(0);
  await expect.poll(() => selectedText(page)).toBe('');
  await page.keyboard.press('Escape');
  await page.keyboard.type(' !');
  // The body exit returns to the owning label, where the normal date trigger works.
  await expect(datePickerPanel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await waitForSynced(page);
  await page.goto(createEditorDocumentPath(editor.docId, 'note1'));
  await waitForSynced(page);
  const header = input(page).locator('[data-zoom-root]');
  await selectRegion(page, header, 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(header.locator('.text-bold')).toHaveText('note1');
  await page.keyboard.press('ControlOrMeta+e');
  await expect(header.locator('.text-bold.text-code')).toHaveText('note1');
  await expect(input(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe('note1');
});

test('rejects one-note and multi-note structural selections, content-to-body crossings and carets', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note1', 2);
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(toolbar(page)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(input(page)).toHaveClass(/editor-input--structural/u);
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await setCaretAtText(page, 'note1', 5);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('body');
  await setCaretAtText(page, 'note1', 2);
  const body = input(page).locator('.note-body');
  const box = (await body.boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await page.keyboard.up('Shift');
  await expect(input(page)).toHaveClass(/editor-input--structural/u);
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await setCaretAtText(page, 'note3', 5);
  await page.keyboard.press('ControlOrMeta+e');
  await page.keyboard.type('x');
  await expect(noteRow(page, 'note3x').locator('.text-code')).toHaveCount(0);
});

test('hides for read-only headings, outside selection and read-only editing', async ({ page, editor }) => {
  await editor.load('flat');
  await selectInlineRange(page, 'note1', 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await page.getByRole('heading', { level: 1 }).evaluate(element => {
    const text = element.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, text.textContent!.length);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(toolbar(page)).toHaveCount(0);
  await selectInlineRange(page, 'note1', 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => globalThis.__remdoTestBridges!.list()[0]!.editor.setEditable(false));
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.evaluate(() => globalThis.__remdoTestBridges!.list()[0]!.editor.setEditable(true));
  await homeZoomBreadcrumb(page).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).dblclick();
  await expect(toolbar(page)).toHaveCount(0);
});

test('waits for primary drag settlement and completed button clicks, and cancels an abandoned press', async ({ page, editor }) => {
  await editor.load('flat');
  await label(page, 'select these words');
  const text = noteRow(page, 'select these words').locator('[data-lexical-text=true]');
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await expect(toolbar(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(toolbar(page)).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await expect(toolbar(page)).toBeVisible();
  await page.mouse.up({ button: 'right' });
  const bold = toolbar(page).getByRole('button', { name: 'Bold', exact: true });
  await bold.hover();
  await page.mouse.down();
  await expect(text).not.toHaveClass(/text-bold/u);
  await page.mouse.move(10, 10);
  await page.mouse.up();
  await expect(text).not.toHaveClass(/text-bold/u);
  await bold.click();
  await expect(noteRow(page, 'select these words').locator('.text-bold')).not.toHaveCount(0);
});

test('suppresses the row during composition and while note, link and date popups own interaction', async ({ page, editor }) => {
  await editor.load('flat');
  await selectInlineRange(page, 'note1', 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await input(page).dispatchEvent('compositionstart', { data: '' });
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await input(page).dispatchEvent('compositionend', { data: '' });
  await editor.load('flat');
  await selectInlineRange(page, 'note1', 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await setCaretAtText(page, 'note1', 5);
  await page.keyboard.type(' @note');
  await expect(editorLocator(page).locator('[data-note-link-picker]')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+e');
  await expect(toolbar(page)).toHaveCount(0);
  await expect(input(page).locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.type(' !');
  await expect(datePickerPanel(page)).toBeVisible();
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(datePickerPanel(page)).toBeVisible();
  await expect(input(page).locator('.text-code')).toHaveCount(0);
});

test('anchors wrapped and reversed ranges to one line, clamps on resize, flips below clipping and hides offscreen', async ({ page, editor }) => {
  await editor.load('flat');
  const text = 'wrapped selected words '.repeat(20);
  await label(page, text);
  const row = noteRow(page, text);
  await row.evaluate(element => { (element as HTMLElement).style.maxWidth = '280px'; });
  await selectRegion(page, row, 0, 120);
  await expect(toolbar(page)).toBeVisible();
  const before = (await toolbar(page).boundingBox())!;
  expect(before.width).toBeLessThan(160);
  await selectRegion(page, row, 120, 0);
  await expect.poll(async () => Math.round((await toolbar(page).boundingBox())!.x)).toBe(Math.round(before.x));
  await expect.poll(async () => Math.round((await toolbar(page).boundingBox())!.y)).toBe(Math.round(before.y));
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(toolbar(page)).toBeVisible();
  await expect.poll(async () => {
    const rect = (await toolbar(page).boundingBox())!;
    return rect.x >= 0 && rect.x + rect.width <= 390;
  }).toBe(true);
  await input(page).evaluate(element => {
    Object.assign((element as HTMLElement).style, { maxHeight: '100px', minHeight: '100px', overflow: 'auto' });
  });
  await selectRegion(page, row, 46, 60);
  await input(page).evaluate(element => {
    const range = document.getSelection()!.getRangeAt(0);
    (element as HTMLElement).scrollTop += range.getClientRects()[0]!.top - element.getBoundingClientRect().top - 3;
  });
  await expect(toolbar(page)).toBeVisible();
  await expect.poll(async () => {
    const rect = (await toolbar(page).boundingBox())!;
    const selectionBottom = await page.evaluate(() => document.getSelection()!.getRangeAt(0).getClientRects()[0]!.bottom);
    return rect.y > selectionBottom;
  }).toBe(true);
  await input(page).evaluate(element => { (element as HTMLElement).scrollTop = 800; });
  await expect(toolbar(page)).toHaveCount(0);
  await input(page).evaluate(element => { (element as HTMLElement).scrollTop = 0; });
  await expect(toolbar(page)).toBeVisible();
});

test('cancels a changed pressed target and keeps editor interaction safe after remote target removal', async ({ page, editor, newWorkerContext }) => {
  await editor.load('flat');
  const peerContext = await newWorkerContext();
  const peer = await peerContext.newPage();
  await peer.goto(page.url());
  await input(peer).waitFor();
  await ensureReady(peer);
  await selectInlineRange(page, 'note1', 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).hover();
  await page.mouse.down();
  await selectInlineRange(peer, 'note1', 0, 5);
  await peer.keyboard.press('ControlOrMeta+b');
  await expect(noteRow(page, 'note1').locator('.text-bold')).toHaveText('note1');
  await page.mouse.up();
  await expect(noteRow(page, 'note1').locator('.text-bold')).toHaveText('note1');
  await peer.keyboard.press('ControlOrMeta+b');
  await expect(noteRow(page, 'note1').locator('.text-bold')).toHaveCount(0);
  await selectInlineRange(page, 'note1', 0, 5);
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).hover();
  await page.mouse.down();
  await label(peer, 'replacement');
  await expect(noteRow(page, 'replacement')).toBeVisible();
  await page.mouse.up();
  await expect(noteRow(page, 'replacement').locator('.text-bold')).toHaveCount(0);
  await selectInlineRange(page, 'replacement', 0, 11);
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Inline code' }).hover();
  await page.mouse.down();
  await setCaretAtText(peer, 'replacement', 0);
  await peer.keyboard.press('ControlOrMeta+a');
  await peer.keyboard.press('ControlOrMeta+a');
  await peer.keyboard.press('Backspace');
  await expect(toolbar(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(input(page)).toBeFocused();
  await page.keyboard.type('x');
  await expect(input(page)).toContainText('x');
  await expect(input(page).locator('.text-bold, .text-code')).toHaveCount(0);
  await peerContext.close();
});

test('clears every native selected line when a wrapped range flips below a clipping editor', async ({ page, editor }) => {
  await editor.load('flat');
  await label(page, wrappedText);
  const row = noteRow(page, wrappedText);
  await input(page).evaluate(element => {
    Object.assign((element as HTMLElement).style, {
      width: '360px', height: '180px', overflow: 'auto', paddingTop: '0px', paddingBottom: '0px',
    });
  });
  await selectRegion(page, row, 0, 180);
  await expect(toolbar(page)).toBeVisible();
  await expect.poll(async () => {
    const box = (await toolbar(page).boundingBox())!;
    const { bounds, lines } = await nativeSelectionLayout(page);
    return box.y > Math.max(...lines.map(line => line.bottom))
      && box.y + box.height <= bounds.bottom
      && box.x >= bounds.left && box.x + box.width <= bounds.right
      && lines.every(line => box.x + box.width <= line.left || box.x >= line.right
        || box.y + box.height <= line.top || box.y >= line.bottom);
  }).toBe(true);
  const forward = (await toolbar(page).boundingBox())!;
  await selectRegion(page, row, 180, 0);
  await expect.poll(async () => {
    const box = (await toolbar(page).boundingBox())!;
    return [Math.round(box.x), Math.round(box.y)];
  }).toEqual([Math.round(forward.x), Math.round(forward.y)]);
});

test('formats directly without room around a wrapped selection and keeps editor focus on resize', async ({ page, editor }) => {
  await editor.load('flat');
  await label(page, wrappedText);
  const row = noteRow(page, wrappedText);
  await input(page).evaluate(element => {
    Object.assign((element as HTMLElement).style, {
      width: '360px', minHeight: '70px', maxHeight: '70px', height: '70px', overflow: 'auto',
      paddingTop: '0px', paddingBottom: '0px',
    });
    element.scrollTop = 0;
  });
  await selectRegion(page, row, 0, 180);
  const hiddenRow = page.getByRole('toolbar', { name: 'Text formatting', includeHidden: true });
  await expect(hiddenRow).toHaveCSS('visibility', 'hidden');
  await expect(input(page)).toBeFocused();
  const { bounds, lines } = await nativeSelectionLayout(page);
  const height = await hiddenRow.evaluate(element => element.getBoundingClientRect().height);
  expect(Math.min(...lines.map(line => line.top)) - bounds.top).toBeLessThan(height);
  expect(bounds.bottom - Math.min(bounds.bottom, Math.max(...lines.map(line => line.bottom)))).toBeLessThan(height);
  for (const on of [true, false]) {
    await page.keyboard.press('ControlOrMeta+e');
    if (on) await expect(row.locator('.text-code')).toHaveText(wrappedText.slice(0, 180));
    else await expect(row.locator('.text-code')).toHaveCount(0);
    await expect(hiddenRow).toHaveCSS('visibility', 'hidden');
    await expect(input(page)).toBeFocused();
    await expect.poll(() => nativeRange(page)).toEqual({ text: wrappedText.slice(0, 180), collapsed: false, backward: false });
  }
  await input(page).evaluate(element => {
    Object.assign((element as HTMLElement).style, { minHeight: '320px', maxHeight: '320px', height: '320px' });
  });
  await expect(toolbar(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe(wrappedText.slice(0, 180));
});

test('toggles a mixed backward code range uniformly, retains native highlight and direction, and isolates undo', async ({ page, editor }) => {
  await editor.load('flat');
  await label(page, wrappedText);
  const row = noteRow(page, wrappedText);
  await row.evaluate(element => { (element as HTMLElement).style.maxWidth = '360px'; });
  await selectRegion(page, row, 0, 45);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(row.locator('.text-code')).toHaveText(wrappedText.slice(0, 45));
  await selectRegion(page, row, 180, 0);
  await expect(toolbar(page)).toBeVisible();
  const code = toolbar(page).getByRole('button', { name: 'Inline code' });
  await expect(code).toHaveAttribute('aria-pressed', 'mixed');
  for (const pressed of ['true', 'false', 'true']) {
    await page.keyboard.press('ControlOrMeta+e');
    await expect(code).toHaveAttribute('aria-pressed', pressed);
    await expect(input(page)).toBeFocused();
    await expect.poll(() => nativeRange(page)).toEqual({ text: wrappedText.slice(0, 180), collapsed: false, backward: true });
  }
  await expect(row.locator('.text-code')).toHaveText(wrappedText.slice(0, 180));
  await expect(row.locator('[data-lexical-text=true]').last()).toHaveText(wrappedText.slice(180));
  await expect(row.locator('[data-lexical-text=true]').last()).not.toHaveClass(/text-code/u);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row.locator('.text-code')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row.locator('.text-code')).toHaveText(wrappedText.slice(0, 180));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row.locator('.text-code')).toHaveText(wrappedText.slice(0, 45));
  const search = page.getByRole('combobox', { name: 'Search document' });
  await search.click();
  await expect(search).toBeFocused();
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(search).toBeFocused();
  await expect(row.locator('.text-code')).toHaveText(wrappedText.slice(0, 45));
});

test.describe('coarse touch host', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('formats code directly while retaining native selection and existing mobile actions without a floating row', async ({ page, editor }) => {
    await editor.load('flat');
    await selectInlineRange(page, 'note2', 0, 5);
    await expect(page.getByRole('toolbar', { name: 'Note actions' })).toBeVisible();
    await expect(toolbar(page)).toHaveCount(0);
    await expect.poll(() => selectedText(page)).toBe('note2');
    await page.keyboard.press('ControlOrMeta+e');
    await expect(noteRow(page, 'note2').locator('.text-code')).toHaveText('note2');
    await expect(input(page)).toBeFocused();
    await expect.poll(() => selectedText(page)).toBe('note2');
    await page.keyboard.press('ControlOrMeta+e');
    await expect(input(page).locator('.text-code')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(noteRow(page, 'note2').locator('.text-code')).toHaveText('note2');
    await page.getByRole('button', { name: 'Indent', exact: true }).click();
    await expect(input(page).locator('.list-nested-item')).toHaveCount(1);
    await expect(toolbar(page)).toHaveCount(0);
  });
});
