import type { SerializedEditorState } from 'lexical';

import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import type { ServerAuth } from '#server/auth/auth';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { createUserDocument } from '#server/documents/current-user';
import type { DocumentRegistry } from '#server/documents/document-registry';
import { createStableDevUsers, STABLE_AUTH_USERS } from '../lib/stable-auth-users';
import type { CreatedStableAuthUser } from '../lib/stable-auth-users';
import { waitForEditorUpdate, withHeadlessCollabSession } from '../../src/headless/collab-session';

const FIXTURE_TITLE_PREFIX = 'fixture: ';

interface DevelopmentDataRuntime {
  auth: ServerAuth;
  database: SqliteServerDatabaseClient;
  registry: DocumentRegistry;
  tokenManager: YSweetDocumentTokenManager;
}

interface DevelopmentDataResetResult {
  documentCount: number;
  userCount: number;
}

function fixtureTitle(name: string): string {
  return `${FIXTURE_TITLE_PREFIX}${name}`;
}

async function seedDocumentContent(docId: string, serialized: SerializedEditorState): Promise<void> {
  await withHeadlessCollabSession(docId, (editor) => {
    const runtimeState = prepareEditorStateForRuntime(serialized, docId);
    const parsed = editor.parseEditorState(JSON.stringify(runtimeState));
    const loaded = waitForEditorUpdate(editor);
    editor.setEditorState(parsed);
    return loaded;
  }, { waitForPersist: true });
}

async function seedUserFixtures(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  auth: ServerAuth,
  user: CreatedStableAuthUser,
  fixtures: ReadonlyMap<string, SerializedEditorState>,
): Promise<number> {
  let count = 0;
  for (const [name, serialized] of fixtures) {
    const title = fixtureTitle(name);
    const docId = (await createUserDocument(
      registry,
      tokenManager,
      user.account.id,
      title,
      { auth },
    )).id;
    await seedDocumentContent(docId, serialized);
    count += 1;
    console.info(`  ${user.definition.email}: created "${title}" -> ${docId}`);
  }
  return count;
}

async function purgeStableDevUsers(runtime: DevelopmentDataRuntime): Promise<void> {
  const userIds: string[] = [];
  for (const definition of Object.values(STABLE_AUTH_USERS)) {
    const account = await runtime.auth.findUserByEmail(definition.email);
    if (account) {
      userIds.push(account.id);
    }
  }
  if (userIds.length === 0) {
    return;
  }

  await runtime.database.db.transaction().execute(async (transaction) => {
    const ownedDocumentIds = transaction
      .selectFrom('documents')
      .select('id')
      .where('owner_user_id', 'in', userIds);
    await transaction
      .deleteFrom('document_access')
      .where('document_id', 'in', ownedDocumentIds)
      .execute();
    await transaction
      .deleteFrom('document_access')
      .where('grantee_user_id', 'in', userIds)
      .execute();
    await transaction
      .deleteFrom('documents')
      .where('owner_user_id', 'in', userIds)
      .execute();
  });

  for (const userId of userIds) {
    await runtime.auth.deleteUser(userId);
  }
}

export async function resetDevelopmentData(
  runtime: DevelopmentDataRuntime,
  fixtures: ReadonlyMap<string, SerializedEditorState>,
): Promise<DevelopmentDataResetResult> {
  await purgeStableDevUsers(runtime);
  const users = await createStableDevUsers(runtime.auth);
  let documentCount = 0;
  for (const user of users) {
    documentCount += await seedUserFixtures(
      runtime.registry,
      runtime.tokenManager,
      runtime.auth,
      user,
      fixtures,
    );
  }
  return { documentCount, userCount: users.length };
}
