import type { LexicalEditor } from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND, SET_NOTE_CHECKED_COMMAND } from '#client/editor/foundation/commands';
import { createKeyHandler } from '#client/editor/keymap/KeymapPlugin';

const altChordDown = { key: 'ArrowDown', alt: true, shift: true } as const;
const altChordUp = { key: 'ArrowUp', alt: true, shift: true } as const;
const ctrlChordDown = { key: 'ArrowDown', ctrl: true, shift: true } as const;
const ctrlChordUp = { key: 'ArrowUp', ctrl: true, shift: true } as const;
const ctrlEnterChord = { key: 'Enter', ctrl: true } as const;

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
