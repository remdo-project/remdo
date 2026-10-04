import type { KeyChord } from '#client/editor/keymap/chords';
import { noteChordsForPlatform } from '#client/editor/keymap/chords';

export type ReferencePlatform = 'mac' | 'other';

export interface ReferenceEntry {
  action: string;
  keys: readonly string[];
}

export interface ReferenceGroup {
  title: string;
  note?: string;
  entries: readonly ReferenceEntry[];
}

const MODIFIER_ORDER = ['ctrl', 'alt', 'meta', 'shift'] as const;

const MODIFIER_LABELS = {
  mac: { ctrl: 'Control', alt: 'Option', meta: '⌘', shift: 'Shift' },
  other: { ctrl: 'Ctrl', alt: 'Alt', meta: 'Win', shift: 'Shift' },
} as const;

export function chordModifierKeys(chord: KeyChord, platform: ReferencePlatform): string[] {
  return MODIFIER_ORDER.filter((modifier) => chord[modifier]).map((modifier) => MODIFIER_LABELS[platform][modifier]);
}

export function referenceGroups(platform: ReferencePlatform): readonly ReferenceGroup[] {
  const mac = platform === 'mac';
  const { toggleChecked, moveDown } = noteChordsForPlatform(mac);
  const command = mac ? '⌘' : 'Ctrl';

  return [
    {
      title: 'Essentials',
      entries: [
        { action: 'Note actions', keys: ['Shift', 'Shift'] },
        { action: 'New note', keys: ['Enter'] },
        { action: 'Indent', keys: ['Tab'] },
        { action: 'Outdent', keys: ['Shift', 'Tab'] },
        { action: 'Move up / down', keys: [...chordModifierKeys(moveDown, platform), '↑/↓'] },
        { action: 'Toggle checked', keys: [...chordModifierKeys(toggleChecked, platform), toggleChecked.key] },
        { action: 'Find in document', keys: [command, 'F'] },
        { action: 'Search documents', keys: [command, 'K'] },
        { action: 'Add / open body', keys: ['Shift', 'Enter'] },
        { action: 'Link a note', keys: ['@'] },
        { action: 'Insert a date', keys: ['!'] },
      ],
    },
    {
      title: 'Editing',
      entries: [
        { action: 'Undo', keys: [command, 'Z'] },
        { action: 'Redo', keys: [command, 'Shift', 'Z'] },
        { action: 'Bold', keys: [command, 'B'] },
        { action: 'Italic', keys: [command, 'I'] },
        { action: 'Underline', keys: [command, 'U'] },
        { action: 'Copy', keys: [command, 'C'] },
        { action: 'Cut', keys: [command, 'X'] },
        { action: 'Paste', keys: [command, 'V'] },
      ],
    },
    {
      title: 'Selection',
      entries: [
        { action: 'Expand selection', keys: [command, 'A'] },
        { action: 'Select text', keys: ['Shift', '←/→'] },
        { action: 'Select notes', keys: ['Shift', '↑/↓'] },
        { action: 'Select to a note', keys: ['Shift', 'Click'] },
        { action: 'Delete selection', keys: [mac ? 'Delete' : 'Backspace'] },
        { action: 'Leave selection', keys: ['Esc'] },
      ],
    },
    {
      title: 'Note actions',
      note: 'First press Shift twice to open the menu.',
      entries: [
        { action: 'Fold/Unfold', keys: ['F'] },
        { action: 'Zoom', keys: ['Z'] },
        { action: 'Zoom out', keys: ['O'] },
        { action: 'Fold to level', keys: ['1–9'] },
        { action: 'Unfold all', keys: ['0'] },
        { action: 'Choose action', keys: ['↑/↓'] },
        { action: 'Run action', keys: ['Enter'] },
        { action: 'Close menu', keys: ['Esc'] },
      ],
    },
  ];
}
