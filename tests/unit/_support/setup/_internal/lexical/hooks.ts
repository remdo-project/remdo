import { config } from '#config';
import { normalizeNoteIdOrThrow } from '@/domain/notes/ids';
import { afterEach, aroundEach } from 'vitest';
import type { TestContext } from 'vitest';
import { readFixture } from '#tests-common/fixtures';
import { cleanupCollabDoc, createTestRuntimeScope } from '#tests-common/runtime-scope';
import { installAuthenticatedApiFetch } from '../../../../collab/_support/auth';
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

aroundEach<TestContext>(async (run, ctx) => {
  const runtimeScope = createTestRuntimeScope();
  const cleanupFetch = config.env.COLLAB_ENABLED ? await installAuthenticatedApiFetch() : () => {};
  const meta = ctx.task.meta;
  const fixtureName = meta.fixture;
  const fixtureOptions = meta.fixtureSchemaBypass ? { skipSchemaValidationOnce: true } : undefined;
  setExpectedConsoleIssues(meta.expectedConsoleIssues ?? null);

  const rawDocId = meta.collabDocId ?? config.env.DEV_DOCUMENT_ID;
  let docId = normalizeNoteIdOrThrow(rawDocId, `Invalid collab doc id: ${rawDocId}`);
  const explicitCollabDocId = config.env.COLLAB_ENABLED && meta.collabDocId != null ? docId : null;
  if (config.env.COLLAB_ENABLED && meta.collabDocId == null) {
    docId = runtimeScope.allocateDocId();
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
  try {
    await run();
  } finally {
    cleanupFetch();
    if (config.env.COLLAB_ENABLED && meta.preserveCollabState !== true) {
      if (explicitCollabDocId) {
        await cleanupCollabDoc(explicitCollabDocId);
      }
      await runtimeScope.cleanupOwnedDocs();
    }
  }
}, config.env.COLLAB_ENABLED ? 15_000 : undefined);

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
