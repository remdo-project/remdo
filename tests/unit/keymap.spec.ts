import { describe, it, expect, afterEach } from 'vitest';
import {
  getDefaultMoveBindingsForPlatform,
  getKeyBinding,
  setMoveBindingsForTests,
} from '@/editor/keymap';
import { MOVE_SELECTION_DOWN_COMMAND, MOVE_SELECTION_UP_COMMAND } from '@/editor/commands';

afterEach(() => {
  setMoveBindingsForTests(null);
});

describe('keymap defaults', () => {
  it('non-apple defaults use alt+shift arrows', () => {
    const bindings = getDefaultMoveBindingsForPlatform(false);
    expect(bindings.down).toMatchObject({ key: 'ArrowDown', shift: true, alt: true });
    expect(bindings.up).toMatchObject({ key: 'ArrowUp', shift: true, alt: true });
  });

  it('apple defaults use ctrl+shift arrows', () => {
    const bindings = getDefaultMoveBindingsForPlatform(true);
    expect(bindings.down).toMatchObject({ key: 'ArrowDown', shift: true, ctrl: true });
    expect(bindings.up).toMatchObject({ key: 'ArrowUp', shift: true, ctrl: true });
  });
});

describe('keymap overrides', () => {
  it('getKeyBinding returns overridden bindings for move commands', () => {
    setMoveBindingsForTests({
      down: { key: 'j', ctrl: true },
      up: { key: 'k', ctrl: true },
    });

    expect(getKeyBinding(MOVE_SELECTION_DOWN_COMMAND)).toMatchObject({ key: 'j', ctrl: true });
    expect(getKeyBinding(MOVE_SELECTION_UP_COMMAND)).toMatchObject({ key: 'k', ctrl: true });
  });
});
