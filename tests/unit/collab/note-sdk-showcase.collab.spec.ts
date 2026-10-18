/**
 * Consumer examples using the real account SDK, authenticated API, and existing
 * editor fixtures. docs/dev/sdk.md owns the showcase conventions.
 * Host initialization is shown in beforeEach; example bodies use consumer operations.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createAccountFixture } from '#tests-common/account-fixture';
import type { AccountFixture } from '#tests-common/account-fixture';
import { SUBPROCESS_TEST_TIMEOUT_MS } from '../_support/timeouts';
import { installAuthenticatedApiFetch } from './_support/auth';
import { renderRemdoEditor } from './_support/render-editor';
import { api, requireData } from '#platform/http/api-client';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { createUserDataRuntime } from '#client/app/user-data/stored-user-data';
import type { Note, UserDataNote } from '#note-sdk';
import { NoteUnavailableError } from '#note-sdk';

describe('note SDK account showcase', () => {
  let userData: UserDataNote;
  let accounts: AccountFixture;

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
  beforeAll(() => {
    api.use(apiRouting);
  });
  beforeEach(async () => {
    accounts = await createAccountFixture();
  }, SUBPROCESS_TEST_TIMEOUT_MS);
  afterAll(() => { api.eject(apiRouting); });

  describe('signed in as the owner', () => {
    beforeEach(async () => {
      onTestFinished(await installAuthenticatedApiFetch(accounts.owner));
      const { userId } = requireData(await api.GET('/api/current-user'));
      const runtime = createUserDataRuntime(userId);
      onTestFinished(() => runtime.dispose());
      await runtime.client.query(runtime.documentsQuery);
      userData = runtime.userData;
    });

    it('uses the same children reader across editor notes and account collections', async () => {
      const { api: remdo, unmount } = await renderRemdoEditor(accounts.documents.privateOutline.id);
      onTestFinished(unmount);
      const labels = (note: Note) => note.getChildren().map(child => child.getText());
      const source = userData.sources.getById('local')!;

      expect(labels(remdo.openDocument.noteRef('note2'))).toEqual(['note3']);
      expect(labels(source)).toEqual(['Documents']);
      expect(labels(source.documents).sort()).toEqual(['New Document', 'Private outline', 'Shared outline']);
      expect(labels(userData.documents).sort()).toEqual(['New Document', 'Private outline', 'Shared outline']);

      // Aggregate listings preserve the source-owned reference and parent.
      const document = source.documents.getById(remdo.openDocument.documentId)!;
      expect(userData.documents.getById(document.getId())).toBe(document);
      expect(document.getParent()).toBe(source.documents);
    });

    it('reads account metadata without acquiring editor content', async () => {
      const { api: remdo, unmount } = await renderRemdoEditor(accounts.documents.privateOutline.id);
      onTestFinished(unmount);
      const document = userData.documents.getById(remdo.openDocument.documentId)!;

      expect(document.getText()).toBe('Private outline');
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

    it('reads preset sharing grants through the owner’s Access collection', () => {
      const document = userData.documents.getById(accounts.documents.sharedOutline.id)!;
      const [grant] = document.access.getChildren();

      expect(document.canShareWith()).toBe(true);
      expect(grant!.getEmail()).toBe(accounts.recipient.email);
      expect(grant!.getText()).toBe('User');
      expect(grant!.getParent()).toBe(document.access);
    });

    it('shares a private document and navigates its new grant through Access', async () => {
      const document = userData.documents.getById(accounts.documents.privateOutline.id)!;
      expect(document.access.getChildren()).toEqual([]);
      const grant = await document.shareWith(accounts.recipient.email);

      expect(grant.getEmail()).toBe(accounts.recipient.email);
      expect(grant.getText()).toBe('User');
      expect(grant.getParent()).toBe(document.access);
      expect(document.access.getChildren().map(child => child.getId())).toContain(grant.getId());
    });
  });

  describe('signed in as the recipient', () => {
    beforeEach(async () => {
      onTestFinished(await installAuthenticatedApiFetch(accounts.recipient));
      const { userId } = requireData(await api.GET('/api/current-user'));
      const runtime = createUserDataRuntime(userId);
      onTestFinished(() => runtime.dispose());
      await runtime.client.query(runtime.documentsQuery);
      userData = runtime.userData;
    });

    it('reads a received document without the owner’s access-management capability', async () => {
      const { api: remdo, unmount } = await renderRemdoEditor(accounts.documents.sharedOutline.id);
      onTestFinished(unmount);
      const document = userData.documents.getById(accounts.documents.sharedOutline.id)!;

      expect(userData.documents.getChildren().map(note => note.getText()).sort()).toEqual(['New Document', 'Shared outline']);
      expect(userData.documents.getById(accounts.documents.privateOutline.id)).toBeNull();
      expect(document.canShareWith()).toBe(false);
      expect(document.access.getChildren()).toEqual([]);
      expect(remdo.openDocument.root.content.getChildren().map(note => note.getText())).toEqual(['note1', 'note2', 'note3']);
    });
  });
});
