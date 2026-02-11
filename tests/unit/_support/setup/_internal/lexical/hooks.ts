import { config } from '#config';
import { createNoteId, normalizeNoteId } from '#lib/editor/note-ids';
import { afterEach, beforeEach } from 'vitest';
import type { TestContext } from 'vitest';
import { readFixture } from '#tests-common/fixtures';
import { renderRemdoEditor } from '../../../../collab/_support/render-editor';
import { getEditorProps } from '../../../lib/editor-props-registry';
import { setExpectedConsoleIssues } from '../assertions/console-allowlist';

function resolveExplicitDocId(rawDocId: string): string {
  const normalized = normalizeNoteId(rawDocId);
  if (normalized) {
    return normalized;
  }
  throw new Error(`Invalid collab doc id: ${rawDocId}`);
}

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

  let docId = resolveExplicitDocId(meta.collabDocId ?? config.env.COLLAB_DOCUMENT_ID);
  if (config.env.COLLAB_ENABLED && meta.collabDocId == null) {
    docId = createNoteId();
  }

  // Seed fixtures via a loader before the main editor mounts.
  if (config.env.COLLAB_ENABLED && fixtureName) {
    const { api: loader, unmount } = await renderRemdoEditor({ docId });
    try {
      const stateJson = await readFixture(fixtureName);
      await loader._bridge.applySerializedState(stateJson, fixtureOptions);
      await loader.waitForSynced();
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

  if (config.env.COLLAB_ENABLED) {
    await remdoTest._bridge.waitForCollaborationReady();
  }

  if (fixtureName) {
    await remdoTest.waitForSynced();
  }
});

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
