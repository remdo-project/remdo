import { describe, expect, it } from 'vitest';
import { prepareEditorStateForPersistence } from '#client/editor/runtime/editor-state-persistence';
import { createUserDocument } from '#server/documents/current-user';
import { createServerRuntime } from '#server/runtime';
import { readFixtureState } from '#tools/fixtures';
import { stripEditorStateDefaults } from '#tools/editor-state-defaults';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { resetDevelopmentData } from '../../../tools/dev/reset-development-data';
import { withHeadlessCollabSession } from '../../../src/headless/collab-session';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('development data reset', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('updates fixture documents in place without removing their access or other documents', async () => {
    const runtime = createServerRuntime();

    try {
      await runtime.auth.ensureReady();
      const initialFixture = await readFixtureState('basic');
      await resetDevelopmentData(runtime, new Map([['reset-contract', initialFixture]]));

      const alice = (await runtime.auth.findUserByEmail(STABLE_AUTH_USERS.alice.email))!;
      const bob = (await runtime.auth.findUserByEmail(STABLE_AUTH_USERS.bob.email))!;
      const initialDocuments = await runtime.registry.listUserDocuments(alice.id);
      const fixtureDocument = initialDocuments.find(
        ({ title }) => title === 'fixture: reset-contract',
      )!;
      const otherDocument = await createUserDocument(
        runtime.registry,
        runtime.tokenManager,
        alice.id,
        'Unrelated development document',
        { auth: runtime.auth },
      );
      await runtime.registry.grantDocumentAccess(fixtureDocument.id, alice.id, bob.id);

      const restoredFixture = await readFixtureState('flat');
      await resetDevelopmentData(runtime, new Map([['reset-contract', restoredFixture]]));

      const restoredDocuments = await runtime.registry.listUserDocuments(alice.id);
      expect(restoredDocuments.find(({ title }) => title === fixtureDocument.title)?.id)
        .toBe(fixtureDocument.id);
      expect(restoredDocuments.some(({ id }) => id === otherDocument.id)).toBe(true);
      await expect(runtime.registry.getDocumentAccessForGrantee(fixtureDocument.id, bob.id))
        .resolves.toEqual({ documentId: fixtureDocument.id, granteeUserId: bob.id });

      const restoredEditorState = await withHeadlessCollabSession(
        fixtureDocument.id,
        (editor) => editor.getEditorState().toJSON(),
      );
      expect(stripEditorStateDefaults(prepareEditorStateForPersistence(
        restoredEditorState,
        fixtureDocument.id,
      )).root).toEqual(stripEditorStateDefaults(restoredFixture).root);
    } finally {
      await runtime.close();
    }
  });
});
