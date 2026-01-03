import { customAlphabet, urlAlphabet } from 'nanoid';

//limit to base58 alphabet
const NOTE_ID_EXCLUDED = new Set(['-', '_', '0', 'O', 'I', 'l']);
const NOTE_ID_ALPHABET = [...urlAlphabet].filter((char) => !NOTE_ID_EXCLUDED.has(char)).join('');
const NOTE_ID_LENGTH = 10;
const createNoteId = customAlphabet(NOTE_ID_ALPHABET, NOTE_ID_LENGTH);

export function createNoteIdAvoiding(usedIds: Set<string>): string {
  let id = createNoteId();
  while (usedIds.has(id)) {
    id = createNoteId();
  }
  return id;
}

export { createNoteId };
