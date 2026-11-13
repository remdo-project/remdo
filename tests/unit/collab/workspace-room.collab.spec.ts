import assert from 'node:assert';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '#config';
import { requestPersistence } from '#collaboration/persistence-barrier';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '#collaboration/runtime';
import type { components } from '#platform/http/api-schema';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import type { Document, OutlineNote } from '../../../src/headless/outline-tree/tree';
import { applyTree, readTree } from '../../../src/headless/outline-tree/yjs';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { installAuthenticatedApiFetch } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

type CallResult = components['schemas']['CallResult'];

async function call(operations: Array<components['schemas']['OperationRequest']>, expected: Record<string, string | null> = {}) {
  const response = await fetch(`${resolveApiServerOrigin()}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations, expected, dryRun: false }),
  });
  expect(response.ok).toBe(true);
  return await response.json() as CallResult;
}

async function readme(workspace: string) {
  const response = await fetch(`${resolveApiServerOrigin()}/api/notes/${workspace}/README.md?content=true`);
  return await response.json() as components['schemas']['Note'];
}

async function createWorkspace(content: string) {
  const created = await call([{ op: 'insert', parent: 'me', kind: 'workspace', text: 'Room test', content }]);
  return String(created.results[0]!.ref);
}

const texts = (tree: Document) => tree.children.map((note) => ((note as OutlineNote).runs[0] as { text: string }).text);

function retext(tree: Document, from: string, to: string): Document {
  const copy = structuredClone(tree);
  const note = copy.children.find((child) => ((child as OutlineNote).runs[0] as { text: string }).text === from) as OutlineNote;
  note.runs = [{ kind: 'text', text: to, marks: [] }];
  return copy;
}

async function open(workspace: string) {
  const { provider, doc } = createProviderFactory({ visibleOrigin: resolveCollabServerOrigin() })(`workspace:${workspace}`, new Map());
  assert(provider instanceof HocuspocusProvider);
  await provider.connect();
  await waitForSync(asCollaborationProviderEvents(provider));
  return {
    doc,
    async persisted() {
      await waitForSync(asCollaborationProviderEvents(provider));
      await requestPersistence(provider);
    },
    close() {
      provider.destroy();
      doc.destroy();
    },
  };
}

describe('workspace rooms', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  // Workspaces are behind a permission that administrators hold.
  let restore: () => void;
  beforeAll(async () => {
    restore = await installAuthenticatedApiFetch({ ...createTestAuthAccount(), admin: true });
  });
  afterAll(() => restore());

  it('load the document from its file and commit edits back as its text when the room closes', async () => {
    const workspace = await createWorkspace('- a\n- b\n');
    const room = await open(workspace);
    try {
      expect(texts(readTree(room.doc))).toEqual(['a', 'b']);

      applyTree(room.doc, retext(readTree(room.doc), 'b', 'b typed'));
      await room.persisted();
      expect((await readme(workspace)).content).toBe('- a\n- b\n');
    } finally {
      room.close();
    }

    await expect.poll(async () => (await readme(workspace)).content).toBe('- a\n- b typed\n');
  });

  it('open an empty workspace without writing its file', async () => {
    const workspace = await createWorkspace('');
    const room = await open(workspace);
    try {
      await room.persisted();

      expect((await readme(workspace)).version ?? null).toBeNull();
    } finally {
      room.close();
    }
  });

  it('save the state recovered from the file before any client syncs', async () => {
    const workspace = await createWorkspace('- a\n');
    const room = await open(workspace);
    try {
      const response = await fetch(`${resolveApiServerOrigin()}/internal/collaboration/workspaces/${workspace}/content`, {
        headers: { 'X-Remdo-Collaboration-Secret': config.env.COLLAB_INTERNAL_SECRET },
      });
      const loaded = await response.json() as { version: string | null; tree?: unknown };

      expect(loaded.tree).toBeUndefined();
      expect(loaded.version).toBe((await readme(workspace)).version);
    } finally {
      room.close();
    }
  });

  it('take a file changed behind an open room instead of overwriting it', async () => {
    const workspace = await createWorkspace('- a\n');
    const room = await open(workspace);
    try {
      const path = `${workspace}/README.md`;
      await call([{ op: 'setContent', target: path, content: '- agent\n' }], { [path]: (await readme(workspace)).version ?? null });

      applyTree(room.doc, retext(readTree(room.doc), 'a', 'a typed'));
      await room.persisted();

      expect((await readme(workspace)).content).toBe('- agent\n');
      await expect.poll(() => texts(readTree(room.doc))).toEqual(['agent']);
    } finally {
      room.close();
    }
  });
});
