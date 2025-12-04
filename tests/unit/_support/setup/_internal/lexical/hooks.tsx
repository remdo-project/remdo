import { config } from '#config';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect } from 'vitest';
import { env } from 'node:process';
import type { TestContext } from 'vitest';
import Editor from '@/editor/Editor';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';
import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import type { EditorStateJSON, LexicalTestHelpers } from '../../../lib/types';
import fs from 'node:fs';
import path from 'node:path';

interface RemdoTestApi {
  editor: LexicalEditor;
  load: (input: string) => Promise<void>;
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>;
  validate: <T>(fn: () => T) => T;
  getEditorState: () => EditorStateJSON;
  waitForSynced: () => Promise<void>;
  waitForCollaborationReady: (timeoutMs?: number) => Promise<void>;
  getCollabDocId: () => string;
  dispatchCommand: (command: unknown, payload?: unknown) => Promise<void>;
  clear: () => Promise<void>;
}

function rootIsCanonical(state: EditorStateJSON): boolean {
  const root = (state as any)?.root;
  const first = root?.children?.[0];
  if (!first || first.type !== 'list') return false;
  if (!root?.children || root.children.length !== 1) return false;
  if (!Array.isArray(first.children) || first.children.length === 0) return false;
  return first.children.every((child: any) => child?.type === 'listitem');
}

let collabDocCounter = 0;
beforeEach<TestContext>(async (ctx) => {
  const task = ctx.task as TestContext['task'] | undefined;
  const metaRaw = task?.meta as { collabDocId?: string } | undefined;
  const meta = metaRaw ?? {};

  let docId = meta.collabDocId ?? config.env.COLLAB_DOCUMENT_ID;
  if (config.env.COLLAB_ENABLED && meta.collabDocId == null) {
    const workerId = env.VITEST_WORKER_ID ?? '0';
    docId = `test-${workerId}-${collabDocCounter++}`;
  }
  const href = globalThis.location.href;
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  params.set('doc', docId);
  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
  globalThis.history.replaceState(null, '', nextUrl);

  const { protocol, hostname } = globalThis.location;
  const collabOrigin = `${protocol}//${hostname}:${config.env.COLLAB_CLIENT_PORT}`;

  render(<Editor collabOrigin={collabOrigin} />);

  const remdoTest = await waitFor(() => {
    const api = (globalThis as typeof globalThis & { remdoTest?: RemdoTestApi }).remdoTest;
    if (!api) {
      throw new Error('remdoTest API not ready');
    }
    return api;
  });

  await remdoTest.waitForCollaborationReady();

  const helpers: LexicalTestHelpers = {
    editor: remdoTest.editor,
    load: async (fixtureName: string) => {
      const abs = path.resolve('tests/fixtures', `${fixtureName}.json`);
      const json = fs.readFileSync(abs, 'utf8');
      await remdoTest.load(json);
    },
    mutate: async (fn, opts) => {
      await remdoTest.mutate(fn, opts);
      assertEditorSchema(remdoTest.getEditorState());
    },
    validate: remdoTest.validate,
    getEditorState: remdoTest.getEditorState,
    waitForSynced: async () => {
      await remdoTest.waitForSynced();
      await waitFor(() => expect(rootIsCanonical(remdoTest.getEditorState())).toBe(true));
    },
    getCollabDocId: remdoTest.getCollabDocId,
    dispatchCommand: remdoTest.dispatchCommand,
  };

  ctx.lexical = helpers;

  if (config.env.COLLAB_ENABLED) {
    await remdoTest.clear();
    await helpers.waitForSynced();
  }
});

afterEach(async ({ lexical }) => {
  await lexical.waitForSynced();
});
