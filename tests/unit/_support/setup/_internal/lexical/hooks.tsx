import { config } from '#config';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { env } from 'node:process';
import type { TestContext } from 'vitest';
import Editor from '@/editor/Editor';
import type { RemdoTestApi } from '@/editor/plugins/TestBridgePlugin';
import fs from 'node:fs';
import path from 'node:path';

function readFixture(name: string): string {
  const abs = path.resolve('tests/fixtures', `${name}.json`);
  return fs.readFileSync(abs, 'utf8');
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

  const remdo = {
    ...remdoTest,
    load: async (fixtureName: string) => remdoTest.applySerializedState(readFixture(fixtureName)),
  } as RemdoTestApi & { load: (fixture: string) => Promise<void> };

  ctx.remdo = remdo;
  ctx.lexical = remdo; // legacy alias during migration

  await ctx.remdo.load('basic'); //FIXME

  if (config.env.COLLAB_ENABLED) {
    await remdo.clear();
    await remdo.waitForSynced();
  }
});

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
