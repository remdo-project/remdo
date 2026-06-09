import { describe, expect, it } from 'vitest';
import type { SourceServer } from '#domain/source-servers';
import type { UserDocument } from '#note-sdk';
import { syncSourceServersMapArray, syncUserDocumentsMapArray } from '#server/projection/user-data';
import * as Y from 'yjs';

function createDocumentArray(): Y.Array<Y.Map<unknown>> {
  const doc = new Y.Doc();
  return doc.getArray<Y.Map<unknown>>('documents');
}

function readDocuments(array: Y.Array<Y.Map<unknown>>): UserDocument[] {
  return array.toArray().map((entry) => ({
    id: String(entry.get('id')),
    title: String(entry.get('title')),
  }));
}

function readSourceServers(array: Y.Array<Y.Map<unknown>>): SourceServer[] {
  return array.toArray().map((entry) => ({
    id: String(entry.get('id')),
    label: String(entry.get('label')),
    baseUrl: String(entry.get('baseUrl')),
    linked: entry.get('linked') === true,
  }));
}

describe('yjs projection helpers', () => {
  it('updates existing map entries in place when keys are stable', () => {
    const array = createDocumentArray();
    syncUserDocumentsMapArray(array, [{ id: 'home', title: 'Home' }]);
    const existingEntry = array.get(0);

    syncUserDocumentsMapArray(array, [{ id: 'home', title: 'Renamed Home' }]);

    expect(array.get(0)).toBe(existingEntry);
    expect(readDocuments(array)).toEqual([{ id: 'home', title: 'Renamed Home' }]);
  });

  it('inserts missing entries without replacing unchanged entries', () => {
    const array = createDocumentArray();
    syncUserDocumentsMapArray(array, [{ id: 'home', title: 'Home' }]);
    const existingEntry = array.get(0);

    syncUserDocumentsMapArray(array, [
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
    syncUserDocumentsMapArray(array, [
      { id: 'home', title: 'Home' },
      { id: 'old', title: 'Old' },
      { id: 'notes', title: 'Notes' },
    ]);
    const suffixEntry = array.get(2);

    syncUserDocumentsMapArray(array, [
      { id: 'home', title: 'Home' },
      { id: 'notes', title: 'Notes' },
    ]);

    expect(array.get(1)).toBe(suffixEntry);
    expect(readDocuments(array)).toEqual([
      { id: 'home', title: 'Home' },
      { id: 'notes', title: 'Notes' },
    ]);
  });

  it('updates projected source servers in place when ids are stable', () => {
    const array = createDocumentArray();
    syncSourceServersMapArray(array, [{
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
      linked: false,
    }]);
    const existingEntry = array.get(0);

    syncSourceServersMapArray(array, [{
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
      linked: true,
    }]);

    expect(array.get(0)).toBe(existingEntry);
    expect(readSourceServers(array)).toEqual([{
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
      linked: true,
    }]);
  });
});
