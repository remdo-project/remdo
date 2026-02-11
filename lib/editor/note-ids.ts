import { customAlphabet, urlAlphabet } from 'nanoid';

// Hyphen/underscore stay invalid in both generation and normalization:
// `_` is the noteRef separator (`docId_noteId`) and `-` hurts double-click copy ergonomics.
const NOTE_ID_STRUCTURAL_EXCLUDED = new Set(['-', '_']);
// Generator additionally avoids ambiguous glyphs for hand-written/read IDs.
const NOTE_ID_GENERATOR_READABILITY_EXCLUDED = new Set(['0', 'O', 'I', 'l']);
const NOTE_ID_ALPHABET = [...urlAlphabet].filter((char) => (
  !NOTE_ID_STRUCTURAL_EXCLUDED.has(char) && !NOTE_ID_GENERATOR_READABILITY_EXCLUDED.has(char)
)).join('');
// Normalization accepts readability-excluded glyphs for external interoperability.
const NOTE_ID_ALLOWED = new Set(
  [...urlAlphabet].filter((char) => !NOTE_ID_STRUCTURAL_EXCLUDED.has(char))
);
const NOTE_ID_MAX_LENGTH = 20;
const NOTE_ID_LENGTH = 10;
const createNoteId = customAlphabet(NOTE_ID_ALPHABET, NOTE_ID_LENGTH);

export function normalizeNoteId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > NOTE_ID_MAX_LENGTH) {
    return null;
  }

  for (const char of trimmed) {
    if (!NOTE_ID_ALLOWED.has(char)) {
      return null;
    }
  }

  return trimmed;
}

export function createNoteIdAvoiding(usedIds: Set<string>, testOnlyGenerator: () => string = createNoteId): string {
  let id = testOnlyGenerator();
  while (usedIds.has(id)) {
    id = testOnlyGenerator();
  }
  return id;
}

export { createNoteId, NOTE_ID_ALPHABET, NOTE_ID_LENGTH, NOTE_ID_MAX_LENGTH };
