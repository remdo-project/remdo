import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearUnsyncedLocalChanges,
  hasUnsyncedLocalChanges,
  markDocumentSynced,
  markDocumentUnsynced,
} from '#collaboration/unsynced-local-changes';

describe('unsynced local changes ledger', () => {
  beforeEach(() => {
    clearUnsyncedLocalChanges();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('does not let one tab\'s acknowledgement drop another tab\'s mark', () => {
    sessionStorage.setItem('remdo-unsynced-tab-id', 'tab-a');
    markDocumentUnsynced('doc-a');
    sessionStorage.setItem('remdo-unsynced-tab-id', 'tab-b');
    markDocumentUnsynced('doc-a');

    sessionStorage.setItem('remdo-unsynced-tab-id', 'tab-a');
    markDocumentSynced('doc-a');

    expect(hasUnsyncedLocalChanges()).toBe(true);
    expect(localStorage.getItem('remdo-unsynced:doc-a:tab-b')).toBe('1');
  });

  it('tracks changes when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});

    markDocumentUnsynced('doc-a');

    expect(hasUnsyncedLocalChanges()).toBe(true);

    markDocumentSynced('doc-a');

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('does not treat an unrelated storage value as unsynced work', () => {
    localStorage.setItem('remdo-unsynced-documents', '["doc-a"]');

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });
});
