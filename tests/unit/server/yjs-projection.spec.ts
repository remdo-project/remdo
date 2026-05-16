import { describe, expect, it } from 'vitest';
import type { ListedDocument } from '@/documents/user-config-notes';
import { syncListedDocumentsMapArray } from '@/server/yjs/projection';
import * as Y from 'yjs';

function createDocumentArray(): Y.Array<Y.Map<unknown>> {
  const doc = new Y.Doc();
  return doc.getArray<Y.Map<unknown>>('documents');
}

function readDocuments(array: Y.Array<Y.Map<unknown>>): ListedDocument[] {
  return array.toArray().map((entry) => ({
    id: String(entry.get('id')),
    title: String(entry.get('title')),
  }));
}

describe('yjs projection helpers', () => {
  it('updates existing map entries in place when keys are stable', () => {
    const array = createDocumentArray();
    syncListedDocumentsMapArray(array, [{ id: 'home', title: 'Home' }]);
    const existingEntry = array.get(0);

    syncListedDocumentsMapArray(array, [{ id: 'home', title: 'Renamed Home' }]);

    expect(array.get(0)).toBe(existingEntry);
    expect(readDocuments(array)).toEqual([{ id: 'home', title: 'Renamed Home' }]);
  });

  it('inserts missing entries without replacing unchanged entries', () => {
    const array = createDocumentArray();
    syncListedDocumentsMapArray(array, [{ id: 'home', title: 'Home' }]);
    const existingEntry = array.get(0);

    syncListedDocumentsMapArray(array, [
      { id: 'home', title: 'Home' },
      { id: 'notes', title: 'Notes' },
    ]);

    expect(array.get(0)).toBe(existingEntry);
    expect(readDocuments(array)).toEqual([
      { id: 'home', title: 'Home' },
      { id: 'notes', title: 'Notes' },
    ]);
  });

  it('removes missing middle entries while preserving unchanged suffix entries', () => {
    const array = createDocumentArray();
    syncListedDocumentsMapArray(array, [
      { id: 'home', title: 'Home' },
      { id: 'old', title: 'Old' },
      { id: 'notes', title: 'Notes' },
    ]);
    const suffixEntry = array.get(2);

    syncListedDocumentsMapArray(array, [
      { id: 'home', title: 'Home' },
      { id: 'notes', title: 'Notes' },
    ]);

    expect(array.get(1)).toBe(suffixEntry);
    expect(readDocuments(array)).toEqual([
      { id: 'home', title: 'Home' },
      { id: 'notes', title: 'Notes' },
    ]);
  });
});
