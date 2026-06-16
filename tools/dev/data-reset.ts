#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { SerializedEditorState } from 'lexical';

import { config } from '#config';
import type { ServerAuth } from '#server/auth/auth';
import { createServerRuntime } from '#server/runtime';
import type { DocumentRegistry, RegisteredDocument } from '#server/documents/document-registry';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { createUserDocument } from '#server/documents/current-user';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { readFixtureState } from '#tools/fixtures';
import { STABLE_AUTH_USERS, provisionDevUsers } from '../lib/stable-auth-users';
import type { StableAuthUser } from '../lib/stable-auth-users';
import { waitForEditorUpdate, withHeadlessCollabSession } from '../lib/headless-collab-session';

const FIXTURE_DIR = path.resolve('tests/fixtures');
const FIXTURE_TITLE_PREFIX = 'fixture: ';

interface CliOptions {
  fresh: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { fresh: false };
  for (const arg of argv) {
    if (arg === '--') {
      // End-of-options separator forwarded by `pnpm run ... -- --fresh`; ignore it.
      continue;
    }
    if (arg === '--fresh') {
      options.fresh = true;
    } else {
      throw new Error(`Unknown argument: ${arg}. Usage: pnpm run dev:data-reset [--fresh]`);
    }
  }
  return options;
}

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

async function deleteSeededDocument(
  database: SqliteServerDatabaseClient,
  document: RegisteredDocument,
): Promise<void> {
  await database.db.deleteFrom('document_access').where('document_id', '=', document.id).execute();
  await database.db.deleteFrom('documents').where('id', '=', document.id).execute();
  const collabDir = path.join(config.env.DATA_DIR, 'collab', document.id);
  await fs.rm(collabDir, { force: true, recursive: true });
}

async function seedUserFixtures(
  registry: DocumentRegistry,
  database: SqliteServerDatabaseClient,
  tokenManager: YSweetDocumentTokenManager,
  auth: ServerAuth,
  user: StableAuthUser,
  fixtureNames: string[],
  fresh: boolean,
): Promise<number> {
  const authUser = await auth.findUserByEmail(user.email);
  if (!authUser) {
    throw new Error(`User ${user.email} not found after provisioning.`);
  }
  const existing = await registry.listUserDocuments(authUser.id);
  const seededDocs = listSeededDocuments(existing, authUser.id);

  if (fresh) {
    for (const document of seededDocs) {
      await deleteSeededDocument(database, document);
    }
    console.info(`  ${user.email}: removed ${seededDocs.length} existing fixture docs (--fresh)`);
  }

  const seededByTitle = new Map(
    (fresh ? [] : seededDocs).map((document) => [document.title, document]),
  );

  let count = 0;
  for (const name of fixtureNames) {
    const title = fixtureTitle(name);
    const serialized = await readFixtureState(name);
    const reuse = seededByTitle.get(title);
    const docId = reuse
      ? reuse.id
      : (await createUserDocument(registry, tokenManager, authUser.id, title, { auth })).id;
    await seedDocumentContent(docId, serialized);
    count += 1;
    console.info(`  ${user.email}: ${reuse ? 'updated' : 'created'} "${title}" -> ${docId}`);
  }
  return count;
}

async function main(): Promise<void> {
  if (!config.isDev) {
    throw new Error('dev:data-reset only runs in development.');
  }
  const options = parseArgs(process.argv.slice(2));
  const fixtureNames = await listFixtureNames();
  console.info(`Found ${fixtureNames.length} fixtures.${options.fresh ? ' (--fresh)' : ''}`);

  const runtime = createServerRuntime();
  try {
    await runtime.auth.ensureReady();
    await provisionDevUsers(runtime.auth);
    let total = 0;
    for (const user of Object.values(STABLE_AUTH_USERS)) {
      total += await seedUserFixtures(
        runtime.registry,
        runtime.database,
        runtime.tokenManager,
        runtime.auth,
        user,
        fixtureNames,
        options.fresh,
      );
    }
    console.info(`Seeded ${total} documents across ${Object.keys(STABLE_AUTH_USERS).length} users.`);
  } finally {
    await runtime.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
