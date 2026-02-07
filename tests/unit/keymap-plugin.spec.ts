import { describe, it, expect, afterEach, vi } from 'vitest';
import { __testCreateKeyHandler, setKeymapOverrides, clearKeymapOverrides } from '@/editor/plugins/KeymapPlugin';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND, SET_NOTE_CHECKED_COMMAND } from '@/editor/commands';

const altChordDown = { key: 'ArrowDown', alt: true, shift: true } as const;
const altChordUp = { key: 'ArrowUp', alt: true, shift: true } as const;
const ctrlChordDown = { key: 'ArrowDown', ctrl: true, shift: true } as const;
const ctrlChordUp = { key: 'ArrowUp', ctrl: true, shift: true } as const;
const ctrlEnterChord = { key: 'Enter', ctrl: true } as const;

type FakeEvent = KeyboardEvent & { defaultPrevented: boolean };

const makeEvent = (chord: { key: string; alt?: boolean; ctrl?: boolean; shift?: boolean; meta?: boolean }): FakeEvent => {
  const event = {
    key: chord.key,
    altKey: chord.alt ?? false,
    ctrlKey: chord.ctrl ?? false,
    shiftKey: chord.shift ?? false,
    metaKey: chord.meta ?? false,
    defaultPrevented: false,
    preventDefault(this: FakeEvent) {
      this.defaultPrevented = true;
    },
  } as unknown as FakeEvent;
  return event;
};

afterEach(() => {
  clearKeymapOverrides();
});

describe('keymapPlugin key handler', () => {
  it('uses alt+shift overrides', () => {
    setKeymapOverrides(
      new Map([
        [REORDER_NOTES_DOWN_COMMAND, [altChordDown]],
        [REORDER_NOTES_UP_COMMAND, [altChordUp]],
      ])
    );
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = __testCreateKeyHandler({ dispatchCommand } as any);

    const downEvent = makeEvent(altChordDown);
    const upEvent = makeEvent(altChordUp);

    expect(handler(downEvent)).toBe(true);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND, null);

    expect(handler(upEvent)).toBe(true);
    expect(upEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND, null);
  });

  it('uses ctrl+shift overrides', () => {
    setKeymapOverrides(
      new Map([
        [REORDER_NOTES_DOWN_COMMAND, [ctrlChordDown]],
        [REORDER_NOTES_UP_COMMAND, [ctrlChordUp]],
      ])
    );
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = __testCreateKeyHandler({ dispatchCommand } as any);

    const downEvent = makeEvent(ctrlChordDown);
    const upEvent = makeEvent(ctrlChordUp);

    expect(handler(downEvent)).toBe(true);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_DOWN_COMMAND, null);

    expect(handler(upEvent)).toBe(true);
    expect(upEvent.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(REORDER_NOTES_UP_COMMAND, null);
  });

  it('uses enter chord override for checked toggle', () => {
    setKeymapOverrides(
      new Map([
        [SET_NOTE_CHECKED_COMMAND, [ctrlEnterChord]],
      ])
    );
    const dispatchCommand = vi.fn().mockReturnValue(true);
    const handler = __testCreateKeyHandler({ dispatchCommand } as any);
    const event = makeEvent(ctrlEnterChord);

    expect(handler(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(dispatchCommand).toHaveBeenCalledWith(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
  });
});
