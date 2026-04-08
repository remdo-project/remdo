import { config } from '#config';
import { createUniqueNoteId, normalizeNoteIdOrThrow } from '#lib/editor/note-ids';
import { afterEach, beforeEach } from 'vitest';
import type { TestContext } from 'vitest';
import { readFixture } from '#tests-common/fixtures';
import type { EditorViewBindings } from '@/editor/view/EditorViewProvider';
import { renderRemdoEditor } from '../../../../collab/_support/render-editor';
import { setExpectedConsoleIssues } from '../assertions/console-allowlist';

async function applyEditorFixture(
  remdo: TestContext['remdo'],
  fixtureName: string,
  fixtureOptions?: { skipSchemaValidationOnce?: boolean }
): Promise<void> {
  const stateJson = await readFixture(fixtureName);
  await remdo._bridge.applySerializedState(stateJson, fixtureOptions);
  await remdo.waitForSynced();
}

beforeEach<TestContext>(async (ctx) => {
  const task = ctx.task as TestContext['task'] | undefined;
  const meta = (task?.meta ?? {}) as {
    collabDocId?: string;
    preserveCollabState?: boolean;
    fixture?: string;
    fixtureSchemaBypass?: boolean;
    expectedConsoleIssues?: string[];
    viewProps?: EditorViewBindings;
  };
  const fixtureName = typeof meta.fixture === 'string' ? meta.fixture : undefined;
  const fixtureOptions = meta.fixtureSchemaBypass ? { skipSchemaValidationOnce: true } : undefined;
  setExpectedConsoleIssues(meta.expectedConsoleIssues ?? null);

  const rawDocId = meta.collabDocId ?? config.env.COLLAB_DOCUMENT_ID;
  let docId = normalizeNoteIdOrThrow(rawDocId, `Invalid collab doc id: ${rawDocId}`);
  if (config.env.COLLAB_ENABLED && meta.collabDocId == null) {
    docId = createUniqueNoteId();
  }

  const seedFixtureBeforeMount = Boolean(config.env.COLLAB_ENABLED && fixtureName);

  if (seedFixtureBeforeMount) {
    // In collab mode the document must already contain the fixture before the
    // test editor mounts, otherwise the live sync path starts from an empty doc.
    const { api: loader, unmount } = await renderRemdoEditor(docId);
    try {
      await applyEditorFixture(loader, fixtureName!, fixtureOptions);
    } finally {
      unmount();
    }
  }

  const { api: remdoTest } = await renderRemdoEditor(docId, meta.viewProps);

  if (fixtureName && !seedFixtureBeforeMount) {
    await applyEditorFixture(remdoTest, fixtureName, fixtureOptions);
  }

  ctx.remdo = remdoTest;
});

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
