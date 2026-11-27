import assert from 'node:assert';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '#config';
import { requestPersistence } from '#collaboration/persistence-barrier';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '#collaboration/runtime';
import type { components } from '#platform/http/api-schema';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '#platform/net/origins';
import type { Document, OutlineNote, TreeNote } from '../../../src/headless/outline-tree/tree';
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

async function readNotes(workspace: string) {
  const response = await fetch(`${resolveApiServerOrigin()}/api/notes/${workspace}/README.md?depth=1`);
  const note = await response.json() as components['schemas']['Note'];
  const refs = new Map((note.children ?? []).map((child) => [child.text, child.ref]));
  return { version: note.version ?? null, refs };
}

async function createWorkspace(content: string) {
  const created = await call([{ op: 'insert', parent: 'me', kind: 'workspace', text: 'Room test', content }]);
  return String(created.results[0]!.ref);
}

const textOf = (note: TreeNote) => ((note as OutlineNote).runs[0] as { text: string }).text;
const texts = (tree: Document) => tree.children.map(textOf);
const cacheIds = (tree: Document) => (tree.children as OutlineNote[]).map((note) => note.cacheId);

function retext(tree: Document, from: string, to: string): Document {
  const copy = structuredClone(tree);
  const note = copy.children.find((child) => textOf(child) === from) as OutlineNote;
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

  it('load the document from its file and save edits back as its text', async () => {
    const workspace = await createWorkspace('- a\n- b\n');
    const room = await open(workspace);
    try {
      expect(texts(readTree(room.doc))).toEqual(['a', 'b']);

      applyTree(room.doc, retext(readTree(room.doc), 'b', 'b typed'));
      await room.persisted();

      expect((await readme(workspace)).content).toBe('- a\n- b typed\n');
    } finally {
      room.close();
    }
  });

  it('keep the lines of notes a save leaves alone', async () => {
    const file = [
      '* plain',
      '* **bold**  and _italic_ with [a link](https://example.com)',
      '* due [1 Nov 2026](date:2026-11-01)',
      '* Status::  in review',
      '* [X] done',
      '',
      '  an unquoted body',
      '  * child',
      '',
      '1) one',
      '2) two',
      '',
    ].join('\n');
    const workspace = await createWorkspace(file);
    const room = await open(workspace);
    try {
      applyTree(room.doc, retext(readTree(room.doc), 'plain', 'plain typed'));
      await room.persisted();

      expect((await readme(workspace)).content).toBe(file.replace('* plain', '- plain typed'));
    } finally {
      room.close();
    }
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

  it('keep the cache IDs of notes an outside change to the file leaves alone', async () => {
    const workspace = await createWorkspace('- a\n- b\n- c\n');
    const room = await open(workspace);
    try {
      const before = cacheIds(readTree(room.doc));
      const path = `${workspace}/README.md`;
      await call([{ op: 'setContent', target: path, content: '- a\n- b by agent\n- c\n' }], { [path]: (await readme(workspace)).version ?? null });

      await room.persisted();

      await expect.poll(() => texts(readTree(room.doc))).toEqual(['a', 'b by agent', 'c']);
      const after = cacheIds(readTree(room.doc));
      expect([after[0], after[2]]).toEqual([before[0], before[2]]);
      expect(after[1]).not.toBe(before[1]);
    } finally {
      room.close();
    }
  });

  it('keep the cache IDs of a closed document through an operation by temporary reference', async () => {
    const workspace = await createWorkspace('- a\n- b\n');
    const first = await open(workspace);
    let before: (string | null)[];
    try {
      await first.persisted();
      before = cacheIds(readTree(first.doc));
    } finally {
      first.close();
    }
    const { version, refs } = await readNotes(workspace);
    await call([{ op: 'setText', target: refs.get('- b')!, text: '- b by agent' }], { [`${workspace}/README.md`]: version });

    const again = await open(workspace);
    try {
      await expect.poll(() => texts(readTree(again.doc))).toEqual(['a', 'b by agent']);
      expect(cacheIds(readTree(again.doc))).toEqual(before);
    } finally {
      again.close();
    }
  });

  it('open a document never opened before with the cache IDs Read gave its notes', async () => {
    const workspace = await createWorkspace('- a\n- b\n');
    const read = await readNotes(workspace);
    const path = `${workspace}/README.md`;
    await call([{ op: 'setContent', target: path, content: '- new\n- a\n- b\n' }], { [path]: read.version });

    const room = await open(workspace);
    try {
      await room.persisted();
      const { refs } = await readNotes(workspace);

      expect([refs.get('- a'), refs.get('- b')]).toEqual([read.refs.get('- a'), read.refs.get('- b')]);
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
