import { describe, expect, it } from 'vitest';
import { $createRangeSelection, $createTextNode, $getSelection, $isRangeSelection, $setSelection } from 'lexical';
import type { ElementNode } from 'lexical';
import { meta, placeCaretAtNote, pressKey, selectNoteTextRange, selectStructuralNotes, typeText } from '#tests';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getBodyWrapper } from '#client/editor/outline/list-structure';
import { getWrapperForContent } from '#client/editor/outline/selection/tree';
import { $createDateNode } from '#client/editor/features/date/date-node';
import { setPopupActive } from '#client/editor/triggers/active-popup';
import { $readInlineFormatTarget } from './selection';

describe('inline formatting target', () => {
  it('distinguishes whole-label text from a one-leaf structural selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteTextRange(remdo, 'note1', 0, 5);
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor)?.states))
      .toEqual({ bold: 'none', italic: 'none', underline: 'none', code: 'none' });
    await selectStructuralNotes(remdo, 'note1');
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).toBeNull();
    await placeCaretAtNote(remdo, 'note1', 2);
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).toBeNull();
  });

  it('offers a body-local range despite its neutral outline snapshot', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body text');
    await remdo.mutate(() => {
      const body = getBodyWrapper($findNoteById('note1')!)!.getFirstChild()! as ElementNode;
      const text = body.getFirstChild()!;
      const selection = $createRangeSelection();
      selection.anchor.set(text.getKey(), 1, 'text');
      selection.focus.set(text.getKey(), 7, 'text');
      $setSelection(selection);
    });
    expect(remdo.editor.selection.get()).toBeNull();
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).not.toBeNull();
    await remdo.mutate(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error('Expected body range');
      selection.anchor.set($findNoteById('note1')!.getFirstChild()!.getKey(), 1, 'text');
    });
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).toBeNull();
  });

  it('reflects selected runs only, including mixed and backward ranges at run boundaries', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const before = $createTextNode('plain ');
      const bold = $createTextNode('bold').toggleFormat('bold');
      const italic = $createTextNode('italic').toggleFormat('italic');
      $findNoteById('note1')!.clear().append(before, bold, italic);
      const selection = $createRangeSelection();
      selection.setTextNodeRange(italic, 0, before, 6);
      $setSelection(selection);
    });
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor)?.states))
      .toEqual({ bold: 'all', italic: 'none', underline: 'none', code: 'none' });
    await remdo.mutate(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error('Expected inline range');
      selection.anchor.set($findNoteById('note1')!.getLastChild()!.getKey(), 6, 'text');
    });
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor)?.states))
      .toEqual({ bold: 'some', italic: 'some', underline: 'none', code: 'none' });
  });

  it('stands down for popup ownership and read-only editing', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteTextRange(remdo, 'note1', 0, 5);
    const token = Symbol('popup');
    setPopupActive(remdo.editor, token, true);
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).toBeNull();
    setPopupActive(remdo.editor, token, false);
    remdo.editor.setEditable(false);
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).toBeNull();
    remdo.editor.setEditable(true);
    expect(remdo.validate(() => $readInlineFormatTarget(remdo.editor))).not.toBeNull();
  });

  it('rejects token-only ranges without treating decorator text as formattable', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    let offered = true;
    await remdo.mutate(() => {
      const note = $findNoteById('note1')!;
      note.clear().append($createDateNode('2026-10-08'));
      note.select(0, 1);
      offered = $readInlineFormatTarget(remdo.editor) !== null;
    });
    expect(offered).toBe(false);
  });

  it('rejects a children wrapper even when it resolves to an adjacent content note', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    let offered = true;
    await remdo.mutate(() => {
      getWrapperForContent($findNoteById('note1')!)!.select(0, 1);
      offered = $readInlineFormatTarget(remdo.editor) !== null;
    });
    expect(offered).toBe(false);
  });
});
