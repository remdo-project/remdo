import type { Page } from '@playwright/test';
import { parseDocumentRef } from '#document-routes';
import { readFixture } from '#tools/fixtures';

export async function load(page: Page, fixtureName: string): Promise<void> {
  const payload = await readFixture(fixtureName);
  await replaceDocument(page, payload);
}

type RemdoTestAction =
  | { kind: 'ensure'; clear: boolean }
  | { kind: 'load'; stateJson: string }
  | { kind: 'getEditorState' }
  | { kind: 'waitForSynced' };

function resolveExpectedDocId(page: Page): string | null {
  const pathname = new URL(page.url()).pathname;
  const prefix = '/n/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  return parseDocumentRef(pathname.slice(prefix.length))?.docId ?? null;
}

async function runWithRemdoTest(page: Page, action: RemdoTestAction): Promise<unknown> {
  const expectedDocId = resolveExpectedDocId(page);
  return page.evaluate(async ({ action, expectedDocId }) => {
    const deadline = Date.now() + 4000;

    const wait = () => new Promise((resolve) => {
      globalThis.setTimeout(resolve, 20);
    });

    while (Date.now() < deadline) {
      const bridges = globalThis.__remdoTestBridges?.list() ?? [];
      const api = expectedDocId
        ? bridges.find((b) => b.getCollabDocId() === expectedDocId) ?? null
        : bridges[0] ?? null;
      if (!api) {
        await wait();
        continue;
      }

      if (action.kind === 'getEditorState') {
        return api.getEditorState();
      }

      if (action.kind === 'waitForSynced') {
        await api.waitForSynced();
        return null;
      }

      const bridge = api._bridge;

      if (action.kind === 'ensure') {
        await bridge.waitForCollaborationReady();
        if (action.clear) {
          await bridge.clear();
        }
        return null;
      }

      await bridge.applySerializedState(action.stateJson);
      return null;
    }

    throw new Error(`remdo bridge is not available for doc ${expectedDocId ?? '<any>'}`);
  }, { action, expectedDocId });
}

export async function ensureReady(page: Page, opts: { clear?: boolean } = {}): Promise<void> {
  const { clear = false } = opts;
  await runWithRemdoTest(page, { kind: 'ensure', clear });
}

async function replaceDocument(page: Page, serializedStateJson: string): Promise<void> {
  await ensureReady(page);
  await runWithRemdoTest(page, {
    kind: 'load',
    stateJson: serializedStateJson,
  });
}

export async function getEditorState(page: Page): Promise<unknown> {
  await ensureReady(page);
  return runWithRemdoTest(page, { kind: 'getEditorState' });
}

export async function waitForSynced(page: Page): Promise<void> {
  await runWithRemdoTest(page, { kind: 'waitForSynced' });
}
