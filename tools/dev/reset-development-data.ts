import type { SerializedEditorState } from 'lexical';

import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import type { ServerAuth } from '#server/auth/auth';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import { createUserDocument } from '#server/documents/current-user';
import type { DocumentRegistry, RegisteredDocument } from '#server/documents/document-registry';
import { restoreStableDevUsers } from '../lib/stable-auth-users';
import type { RestoredStableAuthUser } from '../lib/stable-auth-users';
import { waitForEditorUpdate, withHeadlessCollabSession } from '../../src/headless/collab-session';

const FIXTURE_TITLE_PREFIX = 'fixture: ';

interface DevelopmentDataRuntime {
  auth: ServerAuth;
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

function listSeededDocuments(documents: RegisteredDocument[], ownerUserId: string): RegisteredDocument[] {
  return documents.filter(
    (document) =>
      document.kind === 'document' &&
      document.ownerUserId === ownerUserId &&
      document.title.startsWith(FIXTURE_TITLE_PREFIX),
  );
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
  user: RestoredStableAuthUser,
  fixtures: ReadonlyMap<string, SerializedEditorState>,
): Promise<number> {
  const existing = await registry.listUserDocuments(user.account.id);
  const seededDocs = listSeededDocuments(existing, user.account.id);
  const seededByTitle = new Map(seededDocs.map((document) => [document.title, document]));

  let count = 0;
  for (const [name, serialized] of fixtures) {
    const title = fixtureTitle(name);
    const reuse = seededByTitle.get(title);
    const docId = reuse
      ? reuse.id
      : (await createUserDocument(registry, tokenManager, user.account.id, title, { auth })).id;
    await seedDocumentContent(docId, serialized);
    count += 1;
    console.info(`  ${user.definition.email}: ${reuse ? 'updated' : 'created'} "${title}" -> ${docId}`);
  }
  return count;
}

export async function resetDevelopmentData(
  runtime: DevelopmentDataRuntime,
  fixtures: ReadonlyMap<string, SerializedEditorState>,
): Promise<DevelopmentDataResetResult> {
  const users = await restoreStableDevUsers(runtime.auth);
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
