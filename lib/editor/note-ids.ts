import { customAlphabet, urlAlphabet } from 'nanoid';

//limit to base58 alphabet
const NOTE_ID_EXCLUDED = new Set(['-', '_', '0', 'O', 'I', 'l']);
const NOTE_ID_ALPHABET = [...urlAlphabet].filter((char) => !NOTE_ID_EXCLUDED.has(char)).join('');
const NOTE_ID_LENGTH = 10;
const createRawNoteId = customAlphabet(NOTE_ID_ALPHABET, NOTE_ID_LENGTH);

export function createNoteId(docId: string, usedIds: Set<string>): string {
  let id = createRawNoteId();
  while (id === docId || usedIds.has(id)) {
    id = createRawNoteId();
  }
  return id;
}
