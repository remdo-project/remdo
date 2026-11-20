import { config } from '#config';
import { normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { afterEach, aroundEach } from 'vitest';
import type { TestContext } from 'vitest';
import { readFixture } from '#tools/fixtures';
import type { Fixture } from '#tools/fixtures';
import { installAuthenticatedApiFetch } from '../../../../collab/_support/auth';
import { createCollabTestDocument } from '../../../../collab/_support/documents';
import { renderRemdoEditor } from '../../../../collab/_support/render-editor';
import { $applyTestDocument, readTestDocument } from '#tests-common/test-document';
import { setExpectedConsoleIssues } from '../assertions/console-allowlist';

interface Start {
  fixture?: Fixture;
  document?: string;
  fixtureOptions?: { skipSchemaValidationOnce?: boolean };
}

async function applyStart(remdo: TestContext['remdo'], { fixture, document, fixtureOptions }: Start): Promise<void> {
  if (document !== undefined) {
    const read = readTestDocument(document);
    if (read.selection) throw new Error('A starting document holds no selection.');
    await remdo.mutate(() => $applyTestDocument(read));
  } else {
    await remdo._bridge.applySerializedState(await readFixture(fixture!), fixtureOptions);
  }
  await remdo.waitForSynced();
}

aroundEach<TestContext>(async (run, ctx) => {
  const cleanupFetch = config.env.COLLAB_ENABLED ? await installAuthenticatedApiFetch() : () => {};
  const meta = ctx.task.meta;
  if (meta.fixture && meta.document !== undefined) throw new Error('A test starts from a fixture or a document, not both.');
  const start: Start = {
    fixture: meta.fixture,
    document: meta.document,
    fixtureOptions: meta.fixtureSchemaBypass ? { skipSchemaValidationOnce: true } : undefined,
  };
  const hasStart = Boolean(meta.fixture) || meta.document !== undefined;
  setExpectedConsoleIssues(meta.expectedConsoleIssues ?? null);

  const rawDocId = meta.collabDocId ?? (config.env.COLLAB_ENABLED ? undefined : config.env.DEV_DOCUMENT_ID);
  const docId = await createCollabTestDocument(rawDocId === undefined
    ? undefined
    : normalizeNoteIdOrThrow(rawDocId, `Invalid collab doc id: ${rawDocId}`));

  const seedFixtureBeforeMount = config.env.COLLAB_ENABLED && hasStart;

  if (seedFixtureBeforeMount) {
    // In collab mode the document must already contain the fixture before the
    // test editor mounts, otherwise the live sync path starts from an empty doc.
    const { api: loader, unmount } = await renderRemdoEditor(docId);
    try {
      await applyStart(loader, start);
    } finally {
      unmount();
    }
  }

  const { api: remdoTest } = await renderRemdoEditor(docId, meta.viewProps);

  if (hasStart && !seedFixtureBeforeMount) {
    await applyStart(remdoTest, start);
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
