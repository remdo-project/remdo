export interface KeyChord {
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export interface NoteChords {
  toggleChecked: KeyChord;
  moveDown: KeyChord;
  moveUp: KeyChord;
}

export function noteChordsForPlatform(isApple: boolean): NoteChords {
  const reorder = { shift: true, ctrl: isApple, alt: !isApple };
  return {
    toggleChecked: { key: 'Enter', ctrl: !isApple, meta: isApple },
    moveDown: { key: 'ArrowDown', ...reorder },
    moveUp: { key: 'ArrowUp', ...reorder },
  };
}
