#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { SerializedEditorState } from 'lexical';

import { config } from '#config';
import type { ServerAuth } from '#server/auth/auth';
import { createServerRuntime } from '#server/runtime';
import type { DocumentRegistry, RegisteredDocument } from '#server/documents/document-registry';
import { createUserDocument } from '#server/documents/current-user';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';
import { readFixtureState } from '#tools/fixtures';
import { restoreStableDevUsers } from '../lib/stable-auth-users';
import type { RestoredStableAuthUser } from '../lib/stable-auth-users';
import { waitForPortOpen } from '../lib/net';
import { waitForEditorUpdate, withHeadlessCollabSession } from '../../src/headless/collab-session';

const FIXTURE_DIR = path.resolve('tests/fixtures');
const FIXTURE_TITLE_PREFIX = 'fixture: ';

async function listFixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort();
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

async function main(): Promise<void> {
  if (!config.isDev) {
    throw new Error('dev:data-reset only runs in development.');
  }
  if (process.argv.length > 2) {
    throw new Error('Usage: pnpm run dev:data-reset');
  }
  const collabReady = waitForPortOpen(INTERNAL_SERVICE_HOST, config.env.COLLAB_SERVER_PORT);
  const fixtureNames = await listFixtureNames();
  const fixtures = new Map(await Promise.all(
    fixtureNames.map(async (name) => [name, await readFixtureState(name)] as const),
  ));
  console.info(`Found ${fixtures.size} fixtures.`);

  const runtime = createServerRuntime();
  try {
    await runtime.auth.ensureReady();
    const users = await restoreStableDevUsers(runtime.auth);
    if (!(await collabReady)) {
      throw new Error(
        `Development collaboration service did not become ready on port ${config.env.COLLAB_SERVER_PORT}.`,
      );
    }
    let total = 0;
    for (const user of users) {
      total += await seedUserFixtures(
        runtime.registry,
        runtime.tokenManager,
        runtime.auth,
        user,
        fixtures,
      );
    }
    console.info(`Seeded ${total} documents across ${users.length} users.`);
  } finally {
    await runtime.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
