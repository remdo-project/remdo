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
  }));
}

function readDocumentAccess(entry: Y.Map<unknown>) {
  const access = entry.get('access');
  return access instanceof Y.Array
    ? access.toArray().map((accessEntry) => ({
      documentId: String(accessEntry.get('documentId')),
      email: String(accessEntry.get('email')),
      granteeUserId: String(accessEntry.get('granteeUserId')),
      name: accessEntry.get('name') === null ? null : String(accessEntry.get('name')),
    }))
    : [];
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
    }]);
    const existingEntry = array.get(0);

    syncSourceServersMapArray(array, [{
      id: 'source',
      label: 'Renamed Source',
      baseUrl: 'https://source.example',
    }]);

    expect(array.get(0)).toBe(existingEntry);
    expect(readSourceServers(array)).toEqual([{
      id: 'source',
      label: 'Renamed Source',
      baseUrl: 'https://source.example',
    }]);
  });

  it('projects document shareability when supplied', () => {
    const array = createDocumentArray();

    syncUserDocumentsMapArray(array, [
      { id: 'home', shareable: false, title: 'Home' },
      { id: 'owned', shareable: true, title: 'Owned' },
      { id: 'shared', shareable: false, title: 'Shared' },
    ]);

    expect(array.toArray().map((entry) => ({
      id: entry.get('id'),
      shareable: entry.get('shareable'),
    }))).toEqual([
      { id: 'home', shareable: false },
      { id: 'owned', shareable: true },
      { id: 'shared', shareable: false },
    ]);
  });

  it('syncs nested document access when access is supplied', () => {
    const array = createDocumentArray();

    syncUserDocumentsMapArray(array, [{
      id: 'shareDoc',
      title: 'Shared',
      access: [{
        documentId: 'shareDoc',
        email: 'bob@example.test',
        granteeUserId: 'bob',
        name: 'Bob',
      }],
    }]);
    const documentEntry = array.get(0);
    const access = documentEntry.get('access');
    if (!(access instanceof Y.Array)) {
      throw new TypeError('Expected projected access array.');
    }
    const accessEntry = access.get(0);

    syncUserDocumentsMapArray(array, [{
      id: 'shareDoc',
      title: 'Shared',
      access: [{
        documentId: 'shareDoc',
        email: 'bob@example.test',
        granteeUserId: 'bob',
        name: 'Robert',
      }],
    }]);

    expect(array.get(0)).toBe(documentEntry);
    expect(access.get(0)).toBe(accessEntry);
    expect(readDocumentAccess(documentEntry)).toEqual([{
      documentId: 'shareDoc',
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Robert',
    }]);
  });

  it('preserves nested document access when access is omitted', () => {
    const array = createDocumentArray();
    syncUserDocumentsMapArray(array, [{
      id: 'shareDoc',
      title: 'Shared',
      access: [{
        documentId: 'shareDoc',
        email: 'bob@example.test',
        granteeUserId: 'bob',
        name: 'Bob',
      }],
    }]);

    syncUserDocumentsMapArray(array, [{ id: 'shareDoc', title: 'Renamed' }]);

    expect(readDocumentAccess(array.get(0))).toEqual([{
      documentId: 'shareDoc',
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Bob',
    }]);
  });
});
