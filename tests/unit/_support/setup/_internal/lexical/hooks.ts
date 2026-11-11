import { config } from '#config';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { afterEach, aroundEach } from 'vitest';
import type { TestContext } from 'vitest';
import { readFixture } from '#tools/fixtures';
import type { Fixture } from '#tools/fixtures';
import { installAuthenticatedApiFetch } from '../../../../collab/_support/auth';
import { createCollabTestDocument } from '../../../../collab/_support/documents';
import { renderRemdoEditor } from '../../../../collab/_support/render-editor';
import { setExpectedConsoleIssues } from '../assertions/console-allowlist';

async function applyEditorFixture(
  remdo: TestContext['remdo'],
  fixture: Fixture,
  fixtureOptions?: { skipSchemaValidationOnce?: boolean }
): Promise<void> {
  const stateJson = await readFixture(fixture);
  await remdo._bridge.applySerializedState(stateJson, fixtureOptions);
  await remdo.waitForSynced();
}

aroundEach<TestContext>(async (run, ctx) => {
  const cleanupFetch = config.env.COLLAB_ENABLED ? await installAuthenticatedApiFetch() : () => {};
  const meta = ctx.task.meta;
  const fixture = meta.fixture;
  const fixtureOptions = meta.fixtureSchemaBypass ? { skipSchemaValidationOnce: true } : undefined;
  setExpectedConsoleIssues(meta.expectedConsoleIssues ?? null);

  const rawDocId = meta.collabDocId ?? (config.env.COLLAB_ENABLED ? undefined : config.env.DEV_DOCUMENT_ID);
  const docId = await createCollabTestDocument(rawDocId === undefined
    ? undefined
    : normalizeNoteIdOrThrow(rawDocId, `Invalid collab doc id: ${rawDocId}`));

  const seedFixtureBeforeMount = Boolean(config.env.COLLAB_ENABLED && fixture);

  if (seedFixtureBeforeMount) {
    // In collab mode the document must already contain the fixture before the
    // test editor mounts, otherwise the live sync path starts from an empty doc.
    const { api: loader, unmount } = await renderRemdoEditor(docId);
    try {
      await applyEditorFixture(loader, fixture!, fixtureOptions);
    } finally {
      unmount();
    }
  }

  const { api: remdoTest } = await renderRemdoEditor(docId, meta.viewProps);

  if (fixture && !seedFixtureBeforeMount) {
    await applyEditorFixture(remdoTest, fixture, fixtureOptions);
  }

  ctx.remdo = remdoTest;
  try {
    await run();
  } finally {
    cleanupFetch();
  }
}, config.env.COLLAB_ENABLED ? 15_000 : undefined);

afterEach(async ({ remdo }) => {
  await remdo.waitForSynced();
});
