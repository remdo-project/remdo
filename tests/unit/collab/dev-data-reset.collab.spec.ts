import { request } from 'playwright';
import { describe, expect, it } from 'vitest';
import type { APIRequestContext } from '@playwright/test';
import { prepareEditorStateForPersistence } from '#client/editor/runtime/editor-state-persistence';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { authenticateDjangoTestUser } from '#tests-common/django-auth';
import { provisionDjangoUser } from '#tools/django-user';
import { createFixtureDocument } from '#tools/fixture-document';
import { readFixtureState } from '#tools/fixtures';
import { stripEditorStateDefaults } from '#tools/editor-state-defaults';
import STABLE_AUTH_USERS from '../../../backend/fixtures/development-users.json';
import { resetDevelopmentData } from '../../../tools/dev/reset-development-data';
import { withHeadlessCollabSession } from '../../../src/headless/collab-session';

async function documents(client: APIRequestContext) {
  const response = await client.get('/api/documents', { failOnStatusCode: true });
  return await response.json() as Array<{ id: string; title: string }>;
}

async function readContent(id: string) {
  const state = await withHeadlessCollabSession(id, (editor) => editor.getEditorState().toJSON());
  return stripEditorStateDefaults(prepareEditorStateForPersistence(state, id)).root;
}

// This exercises two full resets and durable content loading across both accounts.
// The server flush interval is part of each newly seeded document's completion.
describe('development fixture setup', { timeout: 60_000 }, () => {
  it('recreates complete fixtures while preserving unrelated documents and revoking old sessions', async () => {
    const baseURL = resolveApiServerOrigin();
    const admin = await request.newContext({ baseURL });
    const charlie = await request.newContext({ baseURL });
    const user = await request.newContext({ baseURL });
    const unrelated = { email: 'fixture-charlie@example.test', name: 'Charlie', password: 'charlie-password-1234' };
    try {
      const initial = await readFixtureState('basic');
      const second = await readFixtureState('flat');
      expect(await resetDevelopmentData(new Map([
        ['reset-contract', initial], ['second-fixture', second],
      ]))).toEqual({ documentCount: 4, userCount: 2 });
      await authenticateDjangoTestUser(user, baseURL, STABLE_AUTH_USERS.user);
      const userDocuments = await documents(user);
      expect(userDocuments.map(({ title }) => title).sort()).toEqual([
        'New Document', 'fixture: reset-contract', 'fixture: second-fixture',
      ]);
      for (const [title, content] of [['fixture: reset-contract', initial], ['fixture: second-fixture', second]] as const) {
        const document = userDocuments.find((entry) => entry.title === title)!;
        expect(await readContent(document.id)).toEqual(stripEditorStateDefaults(content).root);
      }
      await authenticateDjangoTestUser(admin, baseURL, STABLE_AUTH_USERS.admin);
      const first = (await documents(admin)).find(({ title }) => title === 'fixture: reset-contract')!;
      expect(await readContent(first.id)).toEqual(stripEditorStateDefaults(initial).root);
      await provisionDjangoUser(unrelated);
      const preserved = await createFixtureDocument({ email: unrelated.email, title: 'Keep' }, initial);
      await authenticateDjangoTestUser(charlie, baseURL, unrelated);

      const restored = await readFixtureState('flat');
      await resetDevelopmentData(new Map([['reset-contract', restored]]));
      expect((await admin.get('/api/current-user')).status()).toBe(403);
      expect(await documents(charlie)).toContainEqual(expect.objectContaining({ id: preserved, title: 'Keep' }));
      expect(await readContent(preserved)).toEqual(stripEditorStateDefaults(initial).root);
      await authenticateDjangoTestUser(admin, baseURL, STABLE_AUTH_USERS.admin);
      const replacement = (await documents(admin)).find(({ title }) => title === first.title)!;
      expect(replacement.id).not.toBe(first.id);
      expect(await readContent(replacement.id)).toEqual(stripEditorStateDefaults(restored).root);
    } finally {
      await admin.dispose();
      await charlie.dispose();
      await user.dispose();
    }
  });

  it('fails setup when fixture content cannot be loaded', async () => {
    const content = await readFixtureState('basic');
    content.root.children[0]!.type = 'unregistered-fixture-node';
    await provisionDjangoUser(STABLE_AUTH_USERS.admin);
    await expect(createFixtureDocument({ email: STABLE_AUTH_USERS.admin.email, title: 'Invalid' }, content))
      .rejects.toThrow();
  });
});
