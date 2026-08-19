import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearUnsyncedLocalChanges,
  hasUnsyncedLocalChanges,
  markDocumentSynced,
  markDocumentUnsynced,
} from '#collaboration/unsynced-local-changes';

describe('unsynced local changes ledger', () => {
  beforeEach(() => {
    clearUnsyncedLocalChanges();
  });

  it('is empty until a document is marked unsynced', () => {
    expect(hasUnsyncedLocalChanges()).toBe(false);

    markDocumentUnsynced('doc-a');

    expect(hasUnsyncedLocalChanges()).toBe(true);
  });

  it('clears only the acknowledged document', () => {
    markDocumentUnsynced('doc-a');
    markDocumentUnsynced('doc-b');

    markDocumentSynced('doc-a');

    expect(hasUnsyncedLocalChanges()).toBe(true);
    expect(localStorage.getItem('remdo-unsynced:doc-a')).toBeNull();
    expect(localStorage.getItem('remdo-unsynced:doc-b')).toBe('1');

    markDocumentSynced('doc-b');

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('does not treat an unrelated storage value as unsynced work', () => {
    localStorage.setItem('remdo-unsynced-documents', '["doc-a"]');

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });
});
