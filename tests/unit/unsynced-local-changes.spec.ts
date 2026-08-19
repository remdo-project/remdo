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

    markDocumentSynced('doc-b');

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('treats a corrupt ledger as unsynced so logout still warns', () => {
    localStorage.setItem('remdo-unsynced-documents', '{');

    expect(hasUnsyncedLocalChanges()).toBe(true);
  });
});
