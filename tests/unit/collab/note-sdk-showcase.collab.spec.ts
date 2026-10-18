/**
 * Consumer examples using the real account SDK, authenticated API, and existing
 * editor fixtures. docs/dev/sdk.md owns the showcase conventions.
 * Host initialization is shown in beforeEach; example bodies use consumer operations.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { meta } from '#tests';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { provisionDjangoUser } from '#tools/django-user';
import { api, requireData } from '#platform/http/api-client';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { createUserDataRuntime } from '#client/app/user-data/stored-user-data';
import type { Note, UserDataNote } from '#note-sdk';
import { NoteUnavailableError } from '#note-sdk';

describe('note SDK account showcase', () => {
  const recipient = createTestAuthAccount('sdk-showcase-reader');
  let userData: UserDataNote;

  const apiRouting = {
    onRequest: async ({ request }: { request: Request }) => {
      // The browser gateway normally routes /api; this harness runs services separately.
      const url = new URL(request.url);
      return new Request(new URL(url.pathname + url.search, resolveApiServerOrigin()), {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      });
    },
  };
  beforeAll(async () => {
    api.use(apiRouting);
    await provisionDjangoUser(recipient);
  });
  beforeEach(async () => {
    const { userId } = requireData(await api.GET('/api/current-user'));
    const runtime = createUserDataRuntime(userId);
    onTestFinished(() => runtime.dispose());
    await runtime.client.query(runtime.documentsQuery);
    userData = runtime.userData;
  });
  afterAll(() => { api.eject(apiRouting); });

  it('uses the same children reader across editor notes and account collections', meta({
    fixture: 'tree', collabDocId: 'sdkShowcaseHierarchy',
  }), ({ remdo }) => {
    const labels = (note: Note) => note.getChildren().map(child => child.getText());
    const source = userData.sources.getById('local')!;

    expect(labels(remdo.openDocument.noteRef('note2'))).toEqual(['note3']);
    expect(labels(source)).toEqual(['Documents']);
    expect(labels(source.documents)).toContain('sdkShowcaseHierarchy');
    expect(labels(userData.documents)).toContain('sdkShowcaseHierarchy');

    // Aggregate listings preserve the source-owned reference and parent.
    const document = source.documents.getById(remdo.openDocument.documentId)!;
    expect(userData.documents.getById(document.getId())).toBe(document);
    expect(document.getParent()).toBe(source.documents);
  });

  it('reads account metadata without acquiring editor content', meta({
    fixture: 'tree', collabDocId: 'sdkShowcaseData',
  }), ({ remdo }) => {
    const document = userData.documents.getById(remdo.openDocument.documentId)!;

    expect(document.getText()).toBe('sdkShowcaseData');
    expect(document.access.getChildren()).toEqual([]);
    expect(() => document.content.getChildren()).toThrow(NoteUnavailableError);

    // The opened-document host has its own content availability.
    const openedDocument = remdo.openDocument.root;
    expect(openedDocument.content.getChildren().map(note => note.getText())).toEqual(['note1', 'note2']);
  });

  it('keeps a created document reference fresh through rename and deletion', async () => {
    const document = await userData.documents.create('Draft');
    const titles: Array<string | null> = [];
    const unsubscribe = document.subscribe(() => {
      try {
        titles.push(document.getText());
      } catch (error) {
        if (!(error instanceof NoteUnavailableError)) throw error;
        titles.push(null);
      }
    });
    onTestFinished(unsubscribe);

    expect(userData.documents.getById(document.getId())).toBe(document);
    expect(document.getText()).toBe('Draft');

    // A successful rename is readable immediately.
    await document.rename('Quarterly plan');

    expect(document.getText()).toBe('Quarterly plan');
    expect(titles).toContain('Quarterly plan');

    // Deletion is observed as unavailability.
    await document.delete();

    expect(userData.documents.getById(document.getId())).toBeNull();
    expect(titles.at(-1)).toBeNull();
    expect(document.getText).toThrow(NoteUnavailableError);
    unsubscribe();
  });

  it('shares a document and navigates its grant through Access', async ({ remdo }) => {
    const document = userData.documents.getById(remdo.openDocument.documentId)!;
    const grant = await document.shareWith(recipient.email);

    expect(grant.getEmail()).toBe(recipient.email);
    expect(grant.getText()).toBe(recipient.name);
    expect(grant.getParent()).toBe(document.access);
    expect(document.access.getChildren().map((child) => child.getId())).toContain(grant.getId());
  });
});
