#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createYjsProvider } from '@y-sweet/client';
import { DocumentManager } from '@y-sweet/sdk';
import {
  createBindingV2__EXPERIMENTAL,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from '@lexical/yjs';
import { createEditor } from 'lexical';
import WebSocket from 'ws';
import * as Y from 'yjs';
import type { Doc, Transaction } from 'yjs';
import type { Provider } from '@lexical/yjs';
import type { CreateEditorArgs, LexicalEditor, SerializedEditorState } from 'lexical';

import { config } from '#config';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import { CollabSession } from '#collaboration/session';
import { waitForSessionAttachment } from '#collaboration/wait-for-session-attachment';
import { resolveYSweetConnectionString } from '#server/collab-token';
import type { CollaborationSessionProvider } from '#collaboration/runtime';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { createEditorInitialConfig } from '#client/editor/runtime/config';
import type { ServerAuth } from '#server/auth/auth';
import { createServerRuntime } from '#server/runtime';
import type { DocumentRegistry, RegisteredDocument } from '#server/documents/document-registry';
import { createUserDocument } from '#server/documents/current-user';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import { restoreEditorStateDefaults } from '#tests-common/editor-state-defaults';
import { STABLE_AUTH_USERS, createStableAuthUserSessionHeaders } from '../lib/stable-auth-users';
import type { StableAuthUser } from '../lib/stable-auth-users';

const FIXTURE_DIR = path.resolve('tests/fixtures');
const FIXTURE_TITLE_PREFIX = 'fixture: ';

interface CliOptions {
  fresh: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { fresh: false };
  for (const arg of argv) {
    if (arg === '--fresh') {
      options.fresh = true;
    } else {
      throw new Error(`Unknown argument: ${arg}. Usage: pnpm run dev:data-reset [--fresh]`);
    }
  }
  return options;
}

// Mirrors tools/dev/users.ts provisionDevUser: create, else verify by signing in.
async function provisionDevUser(auth: ServerAuth, user: StableAuthUser): Promise<void> {
  const response = await auth.createUser(user, new Headers());
  if (response.ok) {
    return;
  }
  try {
    await createStableAuthUserSessionHeaders(auth, user);
    return;
  } catch {
    // Fall through to actionable error.
  }
  throw new Error(`Failed to create or verify ${user.email}. Delete the existing debug user or auth DB.`);
}

async function listFixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort();
}

type SharedRootObserver = (
  events: Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2],
  transaction: Transaction,
) => void;
interface SharedRoot {
  observeDeep: (callback: SharedRootObserver) => void;
  unobserveDeep: (callback: SharedRootObserver) => void;
}
type SnapshotProvider = Provider & { connect: () => void; destroy: () => void };
type SnapshotProviderWithWebSocket = SnapshotProvider & { _WS?: typeof globalThis.WebSocket };

function createInternalProviderFactory() {
  const manager = new DocumentManager(resolveYSweetConnectionString());
  return async (docId: string, docMap: Map<string, Doc>) => {
    let doc = docMap.get(docId);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(docId, doc);
    }
    doc.get('root', Y.XmlText);
    const token = await manager.getOrCreateDocAndToken(docId, { authorization: 'full' });
    const provider = createYjsProvider(doc, docId, async () => token, {
      connect: false,
      offlineSupport: false,
      showDebuggerLink: false,
    });
    let destroyed = false;
    const originalDestroy = provider.destroy.bind(provider);
    return {
      doc,
      provider: Object.assign(provider as unknown as Provider, {
        destroy: () => {
          if (destroyed) {
            return;
          }
          destroyed = true;
          provider.connect = () => Promise.resolve();
          provider.disconnect();
          originalDestroy();
        },
      }) as CollaborationSessionProvider,
    };
  };
}

function waitForEditorUpdate(editor: LexicalEditor): Promise<void> {
  return new Promise((resolve) => {
    const unregister = editor.registerUpdateListener(() => {
      unregister();
      resolve();
    });
  });
}

async function waitForPersistedData(docId: string, timeoutMs = 15_000): Promise<void> {
  const target = path.join(config.env.DATA_DIR, 'collab', docId, 'data.ysweet');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(target);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function seedDocumentContent(
  docId: string,
  serialized: SerializedEditorState,
  collabOrigin: string,
  collabApiOrigin: string,
): Promise<void> {
  const docMap = new Map<string, Doc>();
  const session = new CollabSession({
    enabled: true,
    docId,
    origin: collabOrigin,
    apiOrigin: collabApiOrigin,
    providerFactory: createInternalProviderFactory(),
  });
  session.attach(docMap);
  const attached = await waitForSessionAttachment(session, docMap, docId);
  const provider = attached.provider as SnapshotProviderWithWebSocket;
  provider._WS = WebSocket as unknown as typeof globalThis.WebSocket;
  const syncDoc = attached.doc;
  const editor = createEditor(createEditorInitialConfig() as CreateEditorArgs);
  const binding = createBindingV2__EXPERIMENTAL(editor, docId, syncDoc, docMap);
  const sharedRoot = binding.root as SharedRoot;
  const observer: SharedRootObserver = (events, transaction) => {
    if (transaction.origin === binding) {
      return;
    }
    syncYjsChangesToLexicalV2__EXPERIMENTAL(
      binding, provider, events, transaction, transaction.origin instanceof Y.UndoManager,
    );
  };
  sharedRoot.observeDeep(observer);
  const removeUpdateListener = editor.registerUpdateListener((payload) => {
    const { prevEditorState, editorState, dirtyElements, normalizedNodes, tags } = payload;
    syncLexicalUpdateToYjsV2__EXPERIMENTAL(
      binding, provider, prevEditorState, editorState, dirtyElements, normalizedNodes, tags,
    );
  });

  try {
    void (provider as SnapshotProvider).connect();
    await session.awaitSynced();
    const initialUpdate = waitForEditorUpdate(editor);
    syncYjsStateToLexicalV2__EXPERIMENTAL(binding, provider);
    await initialUpdate;

    const runtimeState = prepareEditorStateForRuntime(serialized, docId);
    const parsed = editor.parseEditorState(JSON.stringify(runtimeState));
    const loadUpdate = waitForEditorUpdate(editor);
    editor.setEditorState(parsed);
    await loadUpdate;
    await session.awaitSynced();
  } finally {
    sharedRoot.unobserveDeep(observer);
    removeUpdateListener();
    session.destroy();
    for (const doc of docMap.values()) {
      doc.destroy();
    }
  }
  await waitForPersistedData(docId);
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

async function readFixtureState(name: string): Promise<SerializedEditorState> {
  const raw = await fs.readFile(path.join(FIXTURE_DIR, `${name}.json`), 'utf8');
  return restoreEditorStateDefaults(JSON.parse(raw) as SerializedEditorState);
}

async function seedUserFixtures(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  auth: ServerAuth,
  user: StableAuthUser,
  fixtureNames: string[],
  collabOrigin: string,
  collabApiOrigin: string,
): Promise<number> {
  const authUser = await auth.findUserByEmail(user.email);
  if (!authUser) {
    throw new Error(`User ${user.email} not found after provisioning.`);
  }
  const existing = await registry.listUserDocuments(authUser.id);
  const seededByTitle = new Map(
    listSeededDocuments(existing, authUser.id).map((document) => [document.title, document]),
  );

  let count = 0;
  for (const name of fixtureNames) {
    const title = fixtureTitle(name);
    const serialized = await readFixtureState(name);
    const reuse = seededByTitle.get(title);
    const docId = reuse
      ? reuse.id
      : (await createUserDocument(registry, tokenManager, authUser.id, title, { auth })).id;
    await seedDocumentContent(docId, serialized, collabOrigin, collabApiOrigin);
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
    for (const user of Object.values(STABLE_AUTH_USERS)) {
      await provisionDevUser(runtime.auth, user);
    }
    const collabOrigin = resolveCollabServerOrigin({ loopback: true });
    const collabApiOrigin = resolveApiServerOrigin({ loopback: true });
    let total = 0;
    for (const user of Object.values(STABLE_AUTH_USERS)) {
      total += await seedUserFixtures(
        runtime.registry,
        runtime.tokenManager,
        runtime.auth,
        user,
        fixtureNames,
        collabOrigin,
        collabApiOrigin,
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
