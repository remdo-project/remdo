import type { LexicalEditor } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND, SET_NOTE_CHECKED_COMMAND, TOGGLE_INLINE_FORMAT_COMMAND } from '#client/editor/foundation/commands';
import { createKeyHandler } from '#client/editor/keymap/KeymapPlugin';

const altChordDown = { key: 'ArrowDown', alt: true, shift: true } as const;
const altChordUp = { key: 'ArrowUp', alt: true, shift: true } as const;
const ctrlChordDown = { key: 'ArrowDown', ctrl: true, shift: true } as const;
const ctrlChordUp = { key: 'ArrowUp', ctrl: true, shift: true } as const;
const ctrlEnterChord = { key: 'Enter', ctrl: true } as const;

function editorWithNativeSelection(dispatchCommand: LexicalEditor['dispatchCommand']): LexicalEditor {
  const root = document.createElement('div');
  root.tabIndex = 0;
  root.textContent = 'code';
  document.body.append(root);
  root.focus();
  document.getSelection()!.setBaseAndExtent(root.firstChild!, 0, root.firstChild!, 4);
  return { dispatchCommand, getRootElement: () => root } as unknown as LexicalEditor;
}

afterEach(() => document.body.replaceChildren());

const makeEvent = (chord: { key: string; alt?: boolean; ctrl?: boolean; shift?: boolean; meta?: boolean }): KeyboardEvent =>
  new KeyboardEvent('keydown', {
    key: chord.key,
    altKey: chord.alt ?? false,
    ctrlKey: chord.ctrl ?? false,
    shiftKey: chord.shift ?? false,
    metaKey: chord.meta ?? false,
    cancelable: true,
  });

describe('keymapPlugin key handler', () => {
  it.each([false, true])('routes Inline code through the editor command on Apple=%s', isApple => {
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = createKeyHandler(editorWithNativeSelection(dispatchCommand), isApple);
    const event = makeEvent({ key: 'E', ctrl: !isApple, meta: isApple });

    expect(handler(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(TOGGLE_INLINE_FORMAT_COMMAND, { format: 'code' });
  });

  it('leaves an ineligible Inline code shortcut available to the browser', () => {
    const dispatchCommand = vi.fn().mockReturnValue(false);
    const handler = createKeyHandler(editorWithNativeSelection(dispatchCommand), false);
    const event = makeEvent({ key: 'e', ctrl: true });

    expect(handler(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not invoke Inline code during composition or with additional modifiers', () => {
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, false);
    const composing = new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, isComposing: true, cancelable: true });

    expect(handler(composing)).toBe(false);
    expect(composing.defaultPrevented).toBe(false);
    expect(handler(makeEvent({ key: 'e', ctrl: true, shift: true }))).toBe(false);
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it('uses alt+shift to reorder on non-Apple platforms', () => {
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, false);

    const downEvent = makeEvent(altChordDown);
    const upEvent = makeEvent(altChordUp);

    expect(handler(downEvent)).toBe(true);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND);

    expect(handler(upEvent)).toBe(true);
    expect(upEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND);
  });

  it('uses ctrl+shift to reorder on Apple platforms', () => {
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, true);

    const downEvent = makeEvent(ctrlChordDown);
    const upEvent = makeEvent(ctrlChordUp);

    expect(handler(downEvent)).toBe(true);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND);

    expect(handler(upEvent)).toBe(true);
    expect(upEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND);
  });

  it('uses ctrl+enter to toggle checked state on non-Apple platforms', () => {
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, false);
    const event = makeEvent(ctrlEnterChord);

    expect(handler(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
  });

  it('returns false when a matched command is not handled but still prevents the browser default', () => {
    const dispatchCommand = vi.fn().mockReturnValue(false);
    const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, false);
    const event = makeEvent(altChordUp);

    expect(handler(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND);
  });

  it('leaves unmatched keys and modifiers untouched', () => {
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, false);

    for (const chord of [
      { key: 'Escape' },
      { key: 'ArrowDown', alt: true },
      { ...altChordDown, ctrl: true },
    ]) {
      const event = makeEvent(chord);
      expect(handler(event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(dispatchCommand).not.toHaveBeenCalled();
  });
});
