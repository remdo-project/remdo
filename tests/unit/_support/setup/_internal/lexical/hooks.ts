import { config } from '#config';
import { afterEach, beforeEach } from 'vitest';
import { env } from 'node:process';
import type { TestContext } from 'vitest';
import { readFixture } from '../../../../../_support/fixtures';
import { renderRemdoEditor } from '../../../../collab/_support/render-editor';

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

  const remdoTest = await renderRemdoEditor({ docId });
  const remdo = {
    ...remdoTest,
    load: async (fixtureName: string) => remdoTest._bridge.applySerializedState(await readFixture(fixtureName)),
  };

  ctx.remdo = remdo;

  await remdo._bridge.waitForCollaborationReady();

  await remdo.load('basic'); //FIXME

  if (config.env.COLLAB_ENABLED) {
    await remdo._bridge.clear();
    await remdo.waitForSynced();
  }
});

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
