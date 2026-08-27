import { describe, expect, it } from 'vitest';
import { prepareEditorStateForPersistence } from '#client/editor/runtime/editor-state-persistence';
import type { CreateAuthUserInput, ServerAuth } from '#server/auth/auth';
import { extractSessionCookie } from '#server/auth/session-cookie';
import { createUserDocument } from '#server/documents/current-user';
import { createServerRuntime } from '#server/runtime';
import { readFixtureState } from '#tools/fixtures';
import { stripEditorStateDefaults } from '#tools/editor-state-defaults';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { resetDevelopmentData } from '../../../tools/dev/reset-development-data';
import { withHeadlessCollabSession } from '../../../src/headless/collab-session';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const UNRELATED_USERS = {
  charlie: {
    email: 'charlie@example.test',
    name: 'Charlie',
    password: 'charlie-password-1234',
  },
} as const;

async function createUser(auth: ServerAuth, user: CreateAuthUserInput): Promise<string> {
  const response = await auth.createUser(user, new Headers());
  expect(response.ok).toBe(true);
  const account = await auth.findUserByEmail(user.email);
  expect(account).not.toBeNull();
  return account!.id;
}

async function signIn(auth: ServerAuth, email: string, password: string): Promise<Headers> {
  const response = await auth.auth.handler(new Request(new URL('/api/auth/sign-in/email', auth.baseURL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
  expect(response.ok).toBe(true);
  return new Headers({ cookie: extractSessionCookie(response) });
}

describe('development data reset', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('recreates stable users and their documents while preserving unrelated data', async () => {
    const runtime = createServerRuntime();

    try {
      await runtime.auth.ensureReady();
      const initialFixture = await readFixtureState('basic');
      await resetDevelopmentData(runtime, new Map([['reset-contract', initialFixture]]));

      const initialAlice = (await runtime.auth.findUserByEmail(STABLE_AUTH_USERS.alice.email))!;
      const initialAliceSession = await signIn(
        runtime.auth,
        STABLE_AUTH_USERS.alice.email,
        STABLE_AUTH_USERS.alice.password,
      );
      const initialDocuments = await runtime.registry.listUserDocuments(initialAlice.id);
      const initialFixtureDocument = initialDocuments.find(
        ({ title }) => title === 'fixture: reset-contract',
      )!;
      const stableUserDocument = await createUserDocument(
        runtime.registry,
        runtime.tokenManager,
        initialAlice.id,
        'Stable user scratch document',
        { auth: runtime.auth },
      );

      const charlieId = await createUser(runtime.auth, UNRELATED_USERS.charlie);
      const charlieSession = await signIn(
        runtime.auth,
        UNRELATED_USERS.charlie.email,
        UNRELATED_USERS.charlie.password,
      );
      const unrelatedDocument = await createUserDocument(
        runtime.registry,
        runtime.tokenManager,
        charlieId,
        'Unrelated document',
        { auth: runtime.auth },
      );
      await runtime.registry.grantDocumentAccess(unrelatedDocument.id, charlieId, initialAlice.id);

      const restoredFixture = await readFixtureState('flat');
      await resetDevelopmentData(runtime, new Map([['reset-contract', restoredFixture]]));

      const recreatedAlice = (await runtime.auth.findUserByEmail(STABLE_AUTH_USERS.alice.email))!;
      expect(recreatedAlice.id).not.toBe(initialAlice.id);
      await expect(runtime.auth.getSession(initialAliceSession)).resolves.toBeNull();
      await expect(runtime.auth.getSession(charlieSession)).resolves.toMatchObject({
        user: { id: charlieId },
      });
      await signIn(
        runtime.auth,
        STABLE_AUTH_USERS.alice.email,
        STABLE_AUTH_USERS.alice.password,
      );

      await expect(runtime.registry.getDocument(initialFixtureDocument.id)).resolves.toBeNull();
      await expect(runtime.registry.getDocument(stableUserDocument.id)).resolves.toBeNull();
      await expect(runtime.registry.getDocument(unrelatedDocument.id)).resolves.toMatchObject({
        ownerUserId: charlieId,
      });
      await expect(runtime.registry.getDocumentAccessForGrantee(unrelatedDocument.id, initialAlice.id))
        .resolves.toBeNull();

      const recreatedDocuments = await runtime.registry.listUserDocuments(recreatedAlice.id);
      const recreatedFixtureDocument = recreatedDocuments.find(
        ({ title }) => title === initialFixtureDocument.title,
      )!;
      expect(recreatedFixtureDocument.id).not.toBe(initialFixtureDocument.id);

      const restoredEditorState = await withHeadlessCollabSession(
        recreatedFixtureDocument.id,
        (editor) => editor.getEditorState().toJSON(),
      );
      expect(stripEditorStateDefaults(prepareEditorStateForPersistence(
        restoredEditorState,
        recreatedFixtureDocument.id,
      )).root).toEqual(stripEditorStateDefaults(restoredFixture).root);
    } finally {
      await runtime.close();
    }
  });
});
