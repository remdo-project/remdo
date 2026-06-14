import { describe, expect, it } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import { createShareableDocumentOptions } from '#client/app/routes/sharing-documents';

describe('sharing route', () => {
  it('lists only documents that the current user can share', () => {
    const documents = createUserDataRootNote([
      { id: 'home', shareable: false, title: 'Home' },
      { id: 'owned', shareable: true, title: 'Owned' },
      { id: 'shared', shareable: false, title: 'Shared with me' },
    ]).documents().children();

    expect(createShareableDocumentOptions(documents)).toEqual([
      { label: 'Owned', value: 'owned' },
    ]);
  });
});
