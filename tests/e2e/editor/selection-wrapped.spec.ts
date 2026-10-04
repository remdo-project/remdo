import { expect, test } from '#editor/fixtures';
import type { Page } from '#editor/fixtures';
import type { SerializedListItemNode, SerializedListNode } from '@lexical/list';
import type { SerializedLinkNode } from '@lexical/link';
import type { ElementNode, SerializedTextNode } from 'lexical';
import type { SerializedNoteListItemNode } from '#client/editor/runtime/serialized-note-types';
import { editorLocator, setCaretAtText } from '#editor/locators';

const LABEL = 'a'.repeat(90);

async function setLabel(page: Page, text = LABEL, placement: 'first' | 'middle' | 'last' = 'middle') {
  await page.evaluate(async ({ text, placement }) => {
    const api = globalThis.__remdoTestBridges!.list()[0]!;
    await api.updateNoteText('note1', text);
    const state = api.getEditorState();
    const list = state.root.children[0] as SerializedListNode;
    if (placement === 'middle') list.children.unshift(list.children.pop()!);
    if (placement === 'last') list.children.push(list.children.shift()!);
    await api._bridge.applySerializedState(JSON.stringify(state));
    api.editor.getRootElement()!.style.maxWidth = '600px';
  }, { text, placement });
}

async function selectionState(page: Page) {
  return page.evaluate(() => {
    const api = globalThis.__remdoTestBridges!.list()[0]!;
    const outline = api.editor.selection.get()!;
    const selection = document.getSelection()!;
    const ids = api.validate(() => new Map<Element, string>(Array.from(api.editor.getEditorState()._nodeMap)
      .flatMap(([key, node]) => {
        const noteId = (node.exportJSON() as { noteId?: string }).noteId;
        return noteId ? [[api.editor.getElementByKey(key)!, noteId] as const] : [];
      })));
    const point = (node: Node, offset: number) => {
      const row = (node instanceof Element ? node : node.parentElement)!.closest('li.list-item');
      if (!row) return { note: undefined, offset: 0 };
      const range = document.createRange();
      range.setStart(row, 0);
      range.setEnd(node, offset);
      return { note: ids.get(row), offset: range.toString().length };
    };
    const selectedNoteIds = outline.range ? (() => {
      const start = api.editor.getElementByKey(outline.range.visualStartKey)!;
      const end = api.editor.getElementByKey(outline.range.visualEndKey)!;
      return Array.from(api.editor.getRootElement()!.querySelectorAll('li.list-item:not(.list-nested-item)'))
        .filter(row => (row === start || Boolean(start.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING))
          && (row === end || Boolean(end.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING)))
        .map(row => ids.get(row)!);
    })() : [];
    return { kind: outline.kind, selectedNoteIds, anchor: point(selection.anchorNode!, selection.anchorOffset),
      focus: point(selection.focusNode!, selection.focusOffset), text: selection.toString() };
  });
}

async function expectStructure(page: Page, selectedNoteIds: string[]) {
  await expect.poll(async () => {
    const { kind, selectedNoteIds: actual } = await selectionState(page);
    return { kind, selectedNoteIds: actual };
  }).toEqual({ kind: 'structural', selectedNoteIds });
}

for (const [placement, direction, start, focus] of [
  ['first', 'up', 6, 0], ['last', 'down', 6, 11], ['first', 'up', 0, 0], ['last', 'down', 11, 11],
] as const) {
  test(`leaves native ${direction} ${start === focus ? 'no-op' : 'inline motion'} at the ${placement} note alone`, async ({ page, editor }) => {
    await editor.load('flat');
    await setLabel(page, 'Alpha bravo', placement);
    await setCaretAtText(page, 'Alpha bravo', start);
    await page.keyboard.press(direction === 'up' ? 'Shift+ArrowUp' : 'Shift+ArrowDown');
    await expect.poll(async () => {
      const { kind, anchor, focus: actual } = await selectionState(page);
      return { kind, anchor, focus: actual };
    }).toEqual({ kind: start === focus ? 'caret' : 'inline', anchor: { note: 'note1', offset: start },
      focus: { note: 'note1', offset: focus } });
  });
}

for (const [direction, ranged] of [['up', false], ['down', false], ['up', true], ['down', true]] as const) {
  test(`enters only the anchor subtree on actual ${direction} crossing and restores the ${ranged ? 'range' : 'caret'}`, async ({ page, editor }) => {
    await editor.load('basic');
    await setLabel(page, 'Alpha bravo', direction === 'up' ? 'middle' : 'first');
    await setCaretAtText(page, 'Alpha bravo', 6);
    if (ranged) await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(async () => (await selectionState(page)).kind).toBe(ranged ? 'inline' : 'caret');
    const before = await selectionState(page);
    const outward = direction === 'up' ? 'Shift+ArrowUp' : 'Shift+ArrowDown';
    const reverse = direction === 'up' ? 'Shift+ArrowDown' : 'Shift+ArrowUp';
    await page.keyboard.press(outward);
    await expectStructure(page, ['note1', 'note2']);
    await page.keyboard.press(outward);
    await expectStructure(page, direction === 'up' ? ['note3', 'note1', 'note2'] : ['note1', 'note2', 'note3']);
    await page.keyboard.press(reverse);
    await expectStructure(page, ['note1', 'note2']);
    await page.keyboard.press(reverse);
    await expect.poll(() => selectionState(page)).toEqual(before);
  });
}

for (const ranged of [false, true]) {
  test(`delegates successive wrapped-line ${ranged ? 'range' : 'caret'} motion to the browser`, async ({ page, editor }) => {
    const label = `${'a'.repeat(38)} tiny ${'b'.repeat(38)} ${'c'.repeat(38)} ${'d'.repeat(38)}`;
    const anchor = ranged ? 20 : 30;
    await editor.load('flat');
    await setLabel(page, label);
    const native = await page.evaluate(({ label, anchor }) => {
      const control = document.createElement('div');
      control.id = 'native-selection-control';
      control.contentEditable = 'true';
      control.textContent = label;
      Object.assign(control.style, { width: '480px', font: '20px monospace', lineHeight: '30px',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
      document.body.append(control);
      control.focus();
      document.getSelection()!.setBaseAndExtent(control.firstChild!, anchor, control.firstChild!, 30);
      return control.id;
    }, { label, anchor });
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    const nativeFocus = await page.evaluate(id => {
      const offset = document.getSelection()!.focusOffset;
      document.getElementById(id)!.remove();
      return offset;
    }, native);
    await editorLocator(page).locator('li.list-item').filter({ hasText: label }).first().evaluate(row => {
      Object.assign((row as HTMLElement).style, { width: '480px', font: '20px monospace', lineHeight: '30px',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
    });
    await setCaretAtText(page, label, 30);
    if (ranged) await page.evaluate(() => {
      const s = document.getSelection()!;
      s.setBaseAndExtent(s.anchorNode!, 20, s.focusNode!, 30);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(async () => {
      const { kind, anchor: actualAnchor, focus } = await selectionState(page);
      return { kind, anchor: actualAnchor, focus };
    }).toEqual({ kind: 'inline', anchor: { note: 'note1', offset: anchor }, focus: { note: 'note1', offset: nativeFocus } });
  });
}

for (const style of ['plain', 'link', 'bold'] as const) {
  for (const position of ['End', 'Home'] as const) {
    test(`restores a ${style} caret at a native ${position} wrap before further motion and typing`, async ({ page, editor }) => {
      await editor.load('flat');
      await setLabel(page);
      if (style !== 'plain') await page.evaluate(async style => {
        const api = globalThis.__remdoTestBridges!.list()[0]!;
        const state = api.getEditorState();
        const list = state.root.children[0] as SerializedListNode;
        const note = list.children.find(n => (n as SerializedNoteListItemNode).noteId === 'note1') as SerializedListItemNode;
        const text = note.children[0] as SerializedTextNode;
        const row = api.editor.getElementByKey(api.validate(() => Array.from(api.editor.getEditorState()._nodeMap)
          .find(([, node]) => (node.exportJSON() as { noteId?: string }).noteId === 'note1')![0]))!;
        const domText = row.querySelector('[data-lexical-text]')!.firstChild!;
        let split = 0;
        const first = document.createRange();
        first.setStart(domText, 0);
        first.setEnd(domText, 1);
        const top = first.getBoundingClientRect().top;
        while (split < text.text.length) {
          first.setStart(domText, split);
          first.setEnd(domText, split + 1);
          if (first.getBoundingClientRect().top > top) break;
          split++;
        }
        const prefix: SerializedTextNode = { ...text, text: text.text.slice(0, split) };
        const suffix: SerializedTextNode = { ...text, text: text.text.slice(split), format: style === 'bold' ? 1 : text.format };
        const link: SerializedLinkNode = { type: 'link', version: 1, url: 'https://example.test', children: [suffix],
          direction: null, format: '', indent: 0, rel: null, target: null, title: null };
        note.children = [prefix, style === 'bold' ? suffix : link];
        await api._bridge.applySerializedState(JSON.stringify(state));
      }, style);
      await setCaretAtText(page, LABEL.slice(0, 40), position === 'End' ? 20 : 0);
      if (position === 'Home') await page.keyboard.press('ArrowDown');
      await page.keyboard.press(position);
      const before = await selectionState(page);
      const outward = position === 'End' ? 'Shift+ArrowUp' : 'Shift+ArrowDown';
      const reverse = position === 'End' ? 'Shift+ArrowDown' : 'Shift+ArrowUp';
      await page.keyboard.press(outward);
      await expectStructure(page, ['note1']);
      await page.keyboard.press(reverse);
      await expect.poll(() => selectionState(page)).toEqual(before);
      await page.keyboard.press(reverse);
      await expect.poll(async () => (await selectionState(page)).kind).toBe('inline');
      const selected = await selectionState(page);
      const low = Math.min(selected.anchor.offset, selected.focus.offset);
      const high = Math.max(selected.anchor.offset, selected.focus.offset);
      await page.keyboard.type('Z');
      await expect(editor).toMatchOutline([
        { noteId: 'note3', text: 'note3' }, { noteId: 'note1', text: `${LABEL.slice(0, low)}Z${LABEL.slice(high)}` },
        { noteId: 'note2', text: 'note2' },
      ]);
    });
  }
}

test('expires a completed native no-op before another programmatic caret selection', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note1');
  await page.keyboard.press('Shift+ArrowUp');
  await setCaretAtText(page, 'note2', 2);
  await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
  await page.keyboard.type('Z');
  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1' }, { noteId: 'note2', text: 'noZte2' }, { noteId: 'note3', text: 'note3' },
  ]);
});

for (const side of ['before', 'after'] as const) {
  test(`restores a label caret ${side} an inline date before native inward motion`, async ({ page, editor }) => {
    await editor.load('flat');
    await setLabel(page);
    await page.evaluate(async side => {
      const api = globalThis.__remdoTestBridges!.list()[0]!;
      const state = api.getEditorState();
      const list = state.root.children[0] as SerializedListNode;
      const note = list.children[1] as SerializedListItemNode;
      const date = { type: 'date', version: 1, isoDate: '2026-10-03' };
      note.children = side === 'before' ? [date, ...note.children] : [...note.children, date];
      await api._bridge.applySerializedState(JSON.stringify(state));
    }, side);
    await setCaretAtText(page, LABEL, side === 'before' ? 0 : LABEL.length);
    const horizontal = side === 'before' ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(horizontal);
    await page.keyboard.press(horizontal);
    await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
    const before = await selectionState(page);
    const outward = side === 'before' ? 'Shift+ArrowUp' : 'Shift+ArrowDown';
    const inward = side === 'before' ? 'Shift+ArrowDown' : 'Shift+ArrowUp';
    await page.keyboard.press(outward);
    await expectStructure(page, ['note1']);
    await page.keyboard.press(inward);
    await expect.poll(() => selectionState(page)).toEqual(before);
    await page.keyboard.press(inward);
    await expect.poll(async () => {
      const { kind, anchor, focus } = await selectionState(page);
      return { kind, anchor, note: focus.note };
    }).toEqual({ kind: 'inline', anchor: before.anchor, note: 'note1' });
  });
}

for (const direction of ['up', 'down'] as const) {
  test(`preserves unseeded body-to-own-label continuation ${direction}`, async ({ page, editor }) => {
    await editor.load('flat');
    await setLabel(page, 'Alpha bravo');
    await setCaretAtText(page, 'Alpha bravo', 11);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Synthetic body of A');
    await page.evaluate(() => {
      const root = globalThis.__remdoTestBridges!.list()[0]!.editor.getRootElement()!;
      const texts = Array.from(root.querySelectorAll('[data-lexical-text]'));
      const label = texts.find(element => element.textContent === 'Alpha bravo')!.firstChild!;
      const body = texts.find(element => element.textContent === 'Synthetic body of A')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(body, 1, label, 2);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expectStructure(page, ['note1']);
    await page.keyboard.press(direction === 'down' ? 'Shift+ArrowDown' : 'Shift+ArrowUp');
    await expect.poll(async () => {
      const { kind, anchor, focus } = await selectionState(page);
      return { kind, anchor, focus };
    }).toEqual({ kind: 'inline', anchor: { note: 'note1', offset: 0 }, focus: { note: 'note1', offset: 11 } });
    await page.keyboard.press(direction === 'down' ? 'Shift+ArrowUp' : 'Shift+ArrowDown');
    await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
    expect((await selectionState(page)).focus).toEqual({ note: 'note1', offset: 0 });
  });
}

test('abandons a held no-op checkpoint on blur without intercepting a subsequent caret', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note1');
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowUp');
  await page.getByRole('combobox', { name: 'Choose document' }).focus();
  await setCaretAtText(page, 'note2', 2);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
  expect((await selectionState(page)).focus).toEqual({ note: 'note2', offset: 2 });
});

test('settles a crossing before a rapid reversal and further growth', async ({ page, editor }) => {
  await editor.load('basic');
  await setCaretAtText(page, 'note1', 2);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expectStructure(page, ['note1', 'note2', 'note3']);
});

test('keeps the active select-all ladder and its boundary no-op', async ({ page, editor }) => {
  await editor.load('basic');
  await setCaretAtText(page, 'note3', 2);
  await page.keyboard.press('ControlOrMeta+A');
  await expect.poll(async () => {
    const { kind, text } = await selectionState(page);
    return { kind, text };
  }).toEqual({ kind: 'inline', text: 'note3' });
  const inlineBefore = await selectionState(page);
  await page.keyboard.press('Shift+ArrowDown');
  await expectStructure(page, ['note3']);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => selectionState(page)).toEqual(inlineBefore);

  await setCaretAtText(page, 'note1', 2);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+A');
  await expectStructure(page, ['note1', 'note2', 'note3']);
  await page.keyboard.press('Shift+ArrowDown');
  await expectStructure(page, ['note1', 'note2', 'note3']);
  await page.keyboard.press('Shift+ArrowUp');
  await expectStructure(page, ['note1', 'note2']);
});

test('treats label-to-own-body crossing as entry and restores the label caret', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note1', 5);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Synthetic body');
  await setCaretAtText(page, 'note1', 2);
  await page.keyboard.press('Shift+ArrowDown');
  await expectStructure(page, ['note1']);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await selectionState(page)).focus).toEqual({ note: 'note1', offset: 2 });
});

for (const placement of ['first', 'middle'] as const) {
  test(`keeps empty-note native ${placement === 'first' ? 'clamping' : 'crossing and restoration'}`, async ({ page, editor }) => {
    await editor.load('flat');
    await setLabel(page, '', placement);
    await editorLocator(page).locator('li.list-item:not(.list-nested-item)').nth(placement === 'first' ? 0 : 1).evaluate(row => {
      row.closest<HTMLElement>('.editor-input')!.focus();
      document.getSelection()!.setBaseAndExtent(row, 0, row, 0);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.keyboard.press(placement === 'first' ? 'Shift+ArrowUp' : 'Shift+ArrowDown');
    if (placement === 'first') await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
    else {
      await expectStructure(page, ['note1']);
      await page.keyboard.press('Shift+ArrowUp');
      await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
    }
  });
}

test('lets pointer input replace a pending held no-op checkpoint', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note1');
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('Shift');
  await editorLocator(page).locator('[data-lexical-text]').filter({ hasText: 'note2' }).click();
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await selectionState(page)).kind).toBe('caret');
  expect((await selectionState(page)).focus.note).toBe('note2');
});

for (const input of ['type', 'Enter', 'ArrowRight', 'Home', 'PageDown'] as const) {
  test(`settles a native note crossing before immediate ${input}`, async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('Shift+ArrowDown');
    if (input === 'type') await page.keyboard.type('Z');
    else await page.keyboard.press(input);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' }, { noteId: 'note2', text: 'note2' }, { noteId: 'note3', text: 'note3' },
    ]);
    if (input === 'ArrowRight' || input === 'Home' || input === 'PageDown') {
      await expect.poll(async () => {
        const { kind, focus } = await selectionState(page);
        return { kind, focus };
      }).toEqual({ kind: 'caret', focus: { note: 'note1', offset: input === 'Home' ? 0 : 5 } });
    } else await expectStructure(page, ['note1']);
  });
}

for (const ranged of [false, true]) {
  test(`preserves a pending native ${ranged ? 'range' : 'caret'} crossing through an unrelated tree edit`, async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 4);
    if (ranged) await page.evaluate(() => {
      const s = document.getSelection()!;
      s.setBaseAndExtent(s.focusNode!, 1, s.focusNode!, 4);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const before = await selectionState(page);
    await page.evaluate(() => {
      const api = globalThis.__remdoTestBridges!.list()[0]!;
      // Inject the edit after checkpoint capture, before the native default.
      const edit = (event: KeyboardEvent) => {
        if (event.key !== 'ArrowDown' || !event.shiftKey) return;
        document.removeEventListener('keydown', edit);
        api.editor.update(() => {
          const note = Array.from(api.editor.getEditorState()._nodeMap.values())
            .find(node => (node.exportJSON() as SerializedNoteListItemNode).noteId === 'note3')! as ElementNode;
          note.getAllTextNodes()[0]!.setTextContent('remote edit');
        }, { discrete: true });
      };
      document.addEventListener('keydown', edit);
    });
    await page.keyboard.press('Shift+ArrowDown');
    await expectStructure(page, ['note1']);
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(() => selectionState(page)).toEqual(before);
    await expect(editor).toMatchOutline([
      { noteId: 'note1', text: 'note1' }, { noteId: 'note2', text: 'note2' }, { noteId: 'note3', text: 'remote edit' },
    ]);
  });

  test(`keeps a replacement ${ranged ? 'inline range' : 'caret'} after a pending native crossing`, async ({ page, editor }) => {
    await editor.load('flat');
    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('Shift+ArrowDown');
    await page.evaluate(ranged => {
      const text = Array.from(document.querySelectorAll('[data-lexical-text]')).find(node => node.textContent === 'note3')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 2, text, ranged ? 4 : 2);
      document.dispatchEvent(new Event('selectionchange'));
    }, ranged);
    await expect.poll(async () => {
      const { kind, anchor, focus, text } = await selectionState(page);
      return { kind, anchor, focus, text };
    }).toEqual({ kind: ranged ? 'inline' : 'caret', anchor: { note: 'note3', offset: 2 },
      focus: { note: 'note3', offset: ranged ? 4 : 2 }, text: ranged ? 'te' : '' });
  });
}
