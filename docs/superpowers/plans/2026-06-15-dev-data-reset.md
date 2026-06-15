# dev:data-reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one idempotent dev command (`pnpm run dev:data-reset`) that ensures the stable dev users (Alice & Bob) exist and seeds every `tests/fixtures/*.json` as a browsable document owned by each, so logging in always shows real content and a broken dev login is unblocked by a single command.

**Architecture:** A new throwaway-friendly script under `tools/dev/` reuses existing server APIs only — no `src/` changes. It (1) provisions the stable users via the same path `tools/dev/users.ts` uses, (2) for each user resolves the user id, then (3) for each fixture either reuses an existing seeded document (matched by title) or registers a new one via `createUserDocument()`, and (4) pushes fixture content into that document's collab doc through a live Y-Sweet session — the exact reverse of `tools/snapshot/cli.ts save`. Idempotency is keyed on document title (`fixture: <name>`); re-runs replace content in place rather than duplicating. SQL (`data/remdo.sqlite`) is the durable source of truth; collab storage (`data/collab/`) holds content. Both stores live under the current workdir's `data/` only, preserving the wd = single-data-folder boundary.

**Tech Stack:** TypeScript (`tsx`), Better Auth (`ServerAuth`), Kysely document registry, Y-Sweet (`@y-sweet/client`, `@y-sweet/sdk`), Lexical + `@lexical/yjs` experimental binding.

**Measured cost (this machine, local y-sweet):** per-doc seed ~45ms; all 11 fixtures one process = 491ms doc work, 1.22s wall incl. node/tsx startup. Both users (22 docs) ≈ 1.7s. These numbers justify seeding **both users by default with no flag**.

**Design decisions locked in (from brainstorming):**
1. Seeds **both Alice and Bob** by default (cost difference ~0.5s; removes a flag).
2. Default run is **ensure + top-up** (idempotent, non-destructive): create users if missing, ensure each fixture exists as a doc, replace its content in place. Never deletes the user's other docs.
3. Optional `--fresh`: before seeding, delete the user's previously-seeded fixture docs (registry rows + collab dirs) so stale fixtures are removed. Non-fixture user docs are left untouched.
4. No legacy shims/aliases. Decoupled: lives entirely in `tools/dev/`, deletable in one step.

---

## File Structure

- **Create:** `tools/dev/data-reset.ts` — the command. Self-contained: user provisioning reuse, fixture discovery, per-(user,fixture) ensure/seed, live-collab content push, `--fresh` cleanup, summary output.
- **Modify:** `package.json` — add `"dev:data-reset"` script entry next to `dev:users`.
- **Modify:** `docs/run-modes.md` — document the command in the local-dev section (the unblock-the-login workflow).
- **Modify:** `AGENTS.md` — add a one-line pointer under a relevant section so either of us knows: "if you can't log in as the dev user, run `pnpm run dev:data-reset`".

No `src/` changes. No new tests file (this is dev tooling verified by running it against the live stack; the project check rules do not require unit tests for `tools/` scripts).

### Reused existing building blocks (do not reimplement)

- `tools/lib/stable-auth-users.ts` → `STABLE_AUTH_USERS` (alice, bob), `createStableAuthUserSessionHeaders`.
- `tools/dev/users.ts` provisioning pattern → `auth.createUser(...)` then fall back to `createStableAuthUserSessionHeaders` to verify. (Copy the `provisionDevUser` helper logic; it is small and dev-local.)
- `src/server/runtime.ts` → `createServerRuntime()` gives `{ auth, registry, tokenManager, close }`.
- `src/server/auth/auth.ts` → `auth.ensureReady()`, `auth.findUserByEmail(email)` → `{ id, email, name }`.
- `src/server/documents/current-user.ts` → `createUserDocument(registry, tokenManager, userId, title, { auth })` registers a doc in SQL + refreshes the user-data projection. Returns `{ id, title, shareable }`. **It does not write content** — content is pushed separately.
- `src/server/documents/document-registry.ts` → `registry.listUserDocuments(userId)` to find existing seeded docs by title (idempotency + `--fresh` cleanup).
- `tools/snapshot/cli.ts` → copy the `createInternalProviderFactory()` and `withSession()` lifecycle verbatim, but the run callback **writes** fixture content instead of reading. The Lexical→Yjs binding + update listener already syncs on `setEditorState`.
- `tests/_support/editor-state-defaults.ts` → `restoreEditorStateDefaults(serialized)` MUST be applied to raw `tests/fixtures/*.json` before `parseEditorState` (raw fixtures omit defaults like list indent; skipping this throws "Invalid indent value"). Alias: `#tests-common/editor-state-defaults`.
- `src/client/editor/runtime/editor-state-persistence.ts` → `prepareEditorStateForRuntime(serialized, docId)`.
- `src/client/editor/runtime/config.ts` → `createEditorInitialConfig()`.
- `src/platform/net/origins.ts` → `resolveCollabServerOrigin({ loopback: true })`, `resolveApiServerOrigin({ loopback: true })`.
- `src/server/collab-token.ts` → `resolveYSweetConnectionString()` (no args; used by `DocumentManager`).
- `src/domain/notes/ids.ts` → `createUniqueNoteId` (id allocation is delegated to `createUserDocument`'s default; we do not fabricate ids).

### Title convention (idempotency key)

Each seeded document title is exactly `fixture: <name>` (e.g. `fixture: tree-complex`). A document is "a seeded fixture doc" iff `kind === 'document'`, `ownerUserId === user.id`, and `title` starts with `fixture: `. This is the match used both for top-up (reuse id, re-push content) and for `--fresh` cleanup.

---

## Task 1: Scaffold the script with user provisioning + fixture discovery

**Files:**
- Create: `tools/dev/data-reset.ts`
- Modify: `package.json` (scripts block, after the `dev:users` line)

- [ ] **Step 1: Add the package.json script**

In `package.json`, immediately after the `"dev:users": ...` line, add:

```json
    "dev:data-reset": "./tools/env.sh tsx ./tools/dev/data-reset.ts",
```

- [ ] **Step 2: Create the script skeleton (provisioning + discovery + arg parse)**

Create `tools/dev/data-reset.ts`:

```ts
#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { config } from '#config';
import type { ServerAuth } from '#server/auth/auth';
import { createServerRuntime } from '#server/runtime';
import { STABLE_AUTH_USERS, createStableAuthUserSessionHeaders } from '../lib/stable-auth-users';
import type { StableAuthUser } from '../lib/stable-auth-users';

const FIXTURE_TITLE_PREFIX = 'fixture: ';
const FIXTURE_DIR = path.resolve('tests/fixtures');

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
    // Seeding wired up in later tasks.
  } finally {
    await runtime.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 3: Verify it provisions users and finds fixtures (no seeding yet)**

Run: `pnpm run dev:data-reset`
Expected: prints `Found 11 fixtures.` and exits 0. Re-running is safe (users already exist → verified via sign-in path).

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no errors). If `#config`/`#server/*` aliases resolve in `tsconfig.json`, this is clean.

- [ ] **Step 5: Commit**

```bash
git add tools/dev/data-reset.ts package.json
git commit -m "feat(dev): scaffold dev:data-reset (provision users + discover fixtures)"
```

---

## Task 2: Add the live-collab content seeder (Lexical -> Yjs)

**Files:**
- Modify: `tools/dev/data-reset.ts`

- [ ] **Step 1: Add imports for the collab session + Lexical binding**

At the top of `tools/dev/data-reset.ts`, add (alongside existing imports):

```ts
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

import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import { CollabSession } from '#collaboration/session';
import { waitForSessionAttachment } from '#collaboration/wait-for-session-attachment';
import { resolveYSweetConnectionString } from '#server/collab-token';
import type { CollaborationSessionProvider } from '#collaboration/runtime';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { createEditorInitialConfig } from '#client/editor/runtime/config';
import { restoreEditorStateDefaults } from '#tests-common/editor-state-defaults';
```

- [ ] **Step 2: Add the provider factory + session helper (copied from snapshot CLI)**

Add these helpers to `tools/dev/data-reset.ts` (verbatim from `tools/snapshot/cli.ts` `createInternalProviderFactory` and `withSession`, plus `waitForEditorUpdate` and `waitForPersistedData`):

```ts
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
```

- [ ] **Step 3: Add `seedDocumentContent(docId, serialized)`**

Add to `tools/dev/data-reset.ts`. This connects a session, syncs the (empty) doc, then writes fixture content; `setEditorState` triggers the update listener which syncs Lexical→Yjs. Do NOT add a no-op `editor.update()` afterward — a read-only update never fires the listener and the await will hang (verified during the timing spike):

```ts
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
```

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS. (`seedDocumentContent` is unused for now — that is fine; it is wired in Task 3. If the lint step later flags unused, Task 3 resolves it before any lint run.)

- [ ] **Step 5: Commit**

```bash
git add tools/dev/data-reset.ts
git commit -m "feat(dev): add live-collab fixture content seeder to dev:data-reset"
```

---

## Task 3: Wire ensure/top-up seeding per user

**Files:**
- Modify: `tools/dev/data-reset.ts`

- [ ] **Step 1: Add registry import and the per-user seed routine**

Add the import near the other `#server` imports:

```ts
import type { DocumentRegistry, RegisteredDocument } from '#server/documents/document-registry';
import { createUserDocument } from '#server/documents/current-user';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
```

Add this helper to `tools/dev/data-reset.ts`. It finds the user id, reads each fixture (applying `restoreEditorStateDefaults`), reuses an existing seeded doc by title or creates one, then pushes content:

```ts
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
```

- [ ] **Step 2: Call it from `main()`**

Replace the `// Seeding wired up in later tasks.` block in `main()` with:

```ts
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
```

- [ ] **Step 3: Verify a real seed run (requires the dev collab + api stack running)**

Pre-req: a dev stack is up for this workdir (`pnpm run dev`, or collab + api servers). Then:

Run: `pnpm run dev:data-reset`
Expected: prints `Found 11 fixtures.`, 22 `created`/`updated` lines (11 per user), and `Seeded 22 documents across 2 users.` Exit 0.

- [ ] **Step 4: Verify idempotency (re-run = updates, no duplicates)**

Run: `pnpm run dev:data-reset`
Expected: same 22 lines but now all say `updated` (not `created`); still `Seeded 22 documents`. No duplicate titles created.

- [ ] **Step 5: Verify in the browser (DevTools)**

Per AGENTS.md, confirm browser-side truth. Sign in as Alice (credentials from `pnpm run dev:users` output: `alice@example.test` / `alice-password-1234`) and confirm the document list shows the `fixture: *` documents with real outline content (e.g. open `fixture: tree-complex` and see nested notes). Use the DevTools snapshot/screenshot flow from AGENTS.md.

- [ ] **Step 6: Lint**

Run: `pnpm run lint`
Expected: PASS (typecheck + eslint + css + md). Fix any unused-import or formatting fallout in `tools/dev/data-reset.ts`.

- [ ] **Step 7: Commit**

```bash
git add tools/dev/data-reset.ts
git commit -m "feat(dev): seed all fixtures as documents for both stable dev users"
```

---

## Task 4: Add `--fresh` cleanup

**Files:**
- Modify: `tools/dev/data-reset.ts`

- [ ] **Step 1: Add the registry delete + collab dir removal helper**

The document registry has no delete method, so delete the SQL rows directly via the runtime database client, and remove the collab content dir. Add the import:

```ts
import type { SqliteServerDatabaseClient } from '#server/db/client';
```

Add this helper:

```ts
async function deleteSeededDocument(
  database: SqliteServerDatabaseClient,
  document: RegisteredDocument,
): Promise<void> {
  await database.db.deleteFrom('document_access').where('document_id', '=', document.id).execute();
  await database.db.deleteFrom('documents').where('id', '=', document.id).execute();
  const collabDir = path.join(config.env.DATA_DIR, 'collab', document.id);
  await fs.rm(collabDir, { force: true, recursive: true });
}
```

Note: confirm `document_access` and `documents` are valid Kysely table names on `database.db` — they are declared in `src/server/db/schema.ts` (`RemdoDatabase`). If `deleteFrom('document_access')` is not typed, the registry already references both tables, so the schema includes them.

- [ ] **Step 2: Run cleanup before seeding when `--fresh` is set**

In `seedUserFixtures`, change the signature to accept the database and the `fresh` flag, and add cleanup before the seed loop. Replace the existing existing-docs lookup block:

```ts
async function seedUserFixtures(
  registry: DocumentRegistry,
  database: SqliteServerDatabaseClient,
  tokenManager: YSweetDocumentTokenManager,
  auth: ServerAuth,
  user: StableAuthUser,
  fixtureNames: string[],
  collabOrigin: string,
  collabApiOrigin: string,
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
  // ...rest of the function (seed loop) unchanged...
```

- [ ] **Step 3: Pass `database` and `options.fresh` from `main()`**

Update the `seedUserFixtures(...)` call in `main()` to pass `runtime.database` after `runtime.registry`, and `options.fresh` as the final argument.

- [ ] **Step 4: Verify `--fresh` removes and reseeds cleanly**

Run: `pnpm run dev:data-reset -- --fresh`
Expected: per user a `removed 11 existing fixture docs (--fresh)` line, then 11 `created` lines (not `updated`), then `Seeded 22 documents`. Re-running without `--fresh` shows all `updated` again.

- [ ] **Step 5: Verify non-fixture docs survive `--fresh`**

Before running, as Alice create one normal document in the UI (title without the `fixture: ` prefix). Run `pnpm run dev:data-reset -- --fresh`. Confirm in the browser that the manually-created doc still exists and only `fixture: *` docs were reset.

- [ ] **Step 6: Lint**

Run: `pnpm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/dev/data-reset.ts
git commit -m "feat(dev): add --fresh reset to dev:data-reset"
```

---

## Task 5: Document the command

**Files:**
- Modify: `docs/run-modes.md` (local dev section, near the existing `dev:users` sentence ~line 126)
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `docs/run-modes.md`**

Right after the existing sentence "`pnpm run dev:users` provisions stable Alice/Bob users in the local auth DB and prints credentials for the normal login form.", add:

```markdown
  `pnpm run dev:data-reset` goes one step further: it provisions the stable
  users and seeds every `tests/fixtures/*.json` as a document owned by each user
  (titled `fixture: <name>`), so a fresh login always shows browsable content.
  It is idempotent (ensure + top-up): re-runs replace fixture content in place
  and never touch a user's other documents. Pass `--fresh` to delete the
  previously seeded fixture docs (and their collab storage) before reseeding.
  Run it rarely — typically when you cannot log in as a dev user, to unblock.
  It requires the dev collab + API stack to be running.
```

- [ ] **Step 2: Update `AGENTS.md`**

Under `## Safety & Process`, add one bullet (keep it short, matching the file's style):

```markdown
- If you cannot log in as a stable dev user (Alice/Bob), run
  `pnpm run dev:data-reset` to (re)provision them and seed the fixture
  documents. It is idempotent and dev-only; either of us may run it, but not
  while the other is mid-task. `--fresh` resets the seeded fixture docs.
```

- [ ] **Step 3: Markdown lint the changed docs**

Run: `pnpm run lint:md:file -- AGENTS.md docs/run-modes.md`
Expected: PASS (no markdownlint violations).

- [ ] **Step 4: Commit**

```bash
git add docs/run-modes.md AGENTS.md
git commit -m "docs(dev): document dev:data-reset workflow"
```

---

## Final verification

- [ ] **Run the full required local checks** (AGENTS.md "Local agents" handback): `pnpm run lint`. (No `test:unit`/`test:collab` needed — this change touches only `tools/` dev tooling and docs, no behavior/code or collaboration paths under `src/`.) Expected: PASS.
- [ ] **End-to-end smoke:** with the dev stack up, run `pnpm run dev:data-reset`, sign in as both Alice and Bob in the browser, and confirm each sees the 11 `fixture: *` documents with correct content. Then run `pnpm run dev:data-reset -- --fresh` and confirm a clean reseed.

## Cleanup / disposability note

This is intentionally decoupled, throwaway-friendly dev tooling: it lives entirely in `tools/dev/data-reset.ts` + one `package.json` line + two doc mentions. To remove it later, delete the file, the script line, and the doc bullets — nothing in `src/` depends on it.
