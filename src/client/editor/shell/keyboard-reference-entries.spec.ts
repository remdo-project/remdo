import type { LexicalEditor } from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import {
  REORDER_NOTES_DOWN_COMMAND,
  REORDER_NOTES_UP_COMMAND,
  SET_NOTE_CHECKED_COMMAND,
} from '#client/editor/foundation/commands';
import { createKeyHandler } from '#client/editor/keymap/KeymapPlugin';
import { referenceGroups } from './keyboard-reference-entries';
import type { ReferencePlatform } from './keyboard-reference-entries';

const MODIFIER_PROPS: Record<string, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'> = {
  Control: 'ctrlKey',
  Ctrl: 'ctrlKey',
  Option: 'altKey',
  Alt: 'altKey',
  '⌘': 'metaKey',
  Shift: 'shiftKey',
};

function keysOf(platform: ReferencePlatform, action: string): readonly string[] {
  const entry = referenceGroups(platform)
    .flatMap((group) => group.entries)
    .find((candidate) => candidate.action === action);
  return entry!.keys;
}

function pressShown(keys: readonly string[], key: string): KeyboardEvent {
  const init: KeyboardEventInit = { key, cancelable: true };
  for (const label of keys.slice(0, -1)) {
    init[MODIFIER_PROPS[label]!] = true;
  }
  return new KeyboardEvent('keydown', init);
}

describe.each<ReferencePlatform>(['mac', 'other'])('keyboard reference bindings on %s', (platform) => {
  const dispatchCommand = vi.fn().mockReturnValue(true);
  const handler = createKeyHandler({ dispatchCommand } as unknown as LexicalEditor, platform === 'mac');

  it('shows the toggle checked chord the editor honors', () => {
    dispatchCommand.mockClear();

    handler(pressShown(keysOf(platform, 'Toggle checked'), 'Enter'));

    expect(dispatchCommand).toHaveBeenCalledExactlyOnceWith(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });
  });

  it('shows the move chords the editor honors in both directions', () => {
    dispatchCommand.mockClear();
    const keys = keysOf(platform, 'Move up / down');

    handler(pressShown(keys, 'ArrowUp'));
    handler(pressShown(keys, 'ArrowDown'));

    expect(dispatchCommand.mock.calls).toEqual([[REORDER_NOTES_UP_COMMAND], [REORDER_NOTES_DOWN_COMMAND]]);
  });
});
