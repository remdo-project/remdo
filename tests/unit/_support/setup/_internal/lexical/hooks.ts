import { config } from '#config';
import { afterEach, beforeEach } from 'vitest';
import { env } from 'node:process';
import type { TestContext } from 'vitest';
import { readFixture } from '#tests-common/fixtures';
import { renderRemdoEditor } from '../../../../collab/_support/render-editor';
import { getEditorProps } from '../../../lib/editor-props-registry';
import { setExpectedConsoleIssues } from '../assertions/console-allowlist';

let collabDocCounter = 0;
beforeEach<TestContext>(async (ctx) => {
  const task = ctx.task as TestContext['task'] | undefined;
  const meta = (task?.meta ?? {}) as {
    collabDocId?: string;
    preserveCollabState?: boolean;
    fixture?: string;
    fixtureSchemaBypass?: boolean;
    expectedConsoleIssues?: string[];
    editorProps?: Parameters<typeof renderRemdoEditor>[0]['editorProps'];
    editorPropsKey?: string;
  };
  const fixtureName = typeof meta.fixture === 'string' ? meta.fixture : undefined;
  const fixtureOptions = meta.fixtureSchemaBypass ? { skipSchemaValidationOnce: true } : undefined;
  setExpectedConsoleIssues(meta.expectedConsoleIssues ?? null);

  let docId = meta.collabDocId ?? config.env.COLLAB_DOCUMENT_ID;
  if (config.env.COLLAB_ENABLED && meta.collabDocId == null) {
    const workerId = env.VITEST_WORKER_ID ?? '0';
    docId = `test-${workerId}-${collabDocCounter++}`;
  }

  // Seed fixtures via a loader before the main editor mounts.
  if (config.env.COLLAB_ENABLED && fixtureName) {
    const { api: loader, unmount } = await renderRemdoEditor({ docId });
    try {
      const stateJson = await readFixture(fixtureName);
      await loader._bridge.applySerializedState(stateJson, fixtureOptions);
    } finally {
      unmount();
    }
  }

  const resolvedEditorProps = meta.editorPropsKey ? getEditorProps(meta.editorPropsKey) ?? meta.editorProps : meta.editorProps;
  const { api: remdoTest } = await renderRemdoEditor({ docId, editorProps: resolvedEditorProps });

  if (!config.env.COLLAB_ENABLED && fixtureName) {
    const stateJson = await readFixture(fixtureName);
    await remdoTest._bridge.applySerializedState(stateJson, fixtureOptions);
  }

  ctx.remdo = remdoTest;

  if (fixtureName) {
    await remdoTest.waitForSynced();
  }
});

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
