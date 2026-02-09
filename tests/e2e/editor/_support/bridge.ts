import type { Page } from '@playwright/test';
import { readFixture } from '#tests-common/fixtures';

export async function load(page: Page, fixtureName: string): Promise<void> {
  const payload = await readFixture(fixtureName);
  await replaceDocument(page, payload);
}

type RemdoTestAction =
  | { kind: 'ensure'; clear: boolean }
  | { kind: 'load'; stateJson: string }
  | { kind: 'getEditorState' }
  | { kind: 'waitForSynced' };

async function runWithRemdoTest(page: Page, action: RemdoTestAction): Promise<unknown> {
  return page.evaluate(async (payload) => {
    const api = await (globalThis.__remdoBridgePromise ?? Promise.reject(new Error('remdo bridge is not available')));

    if (payload.kind === 'getEditorState') {
      return api.getEditorState();
    }

    if (payload.kind === 'waitForSynced') {
      await api.waitForSynced();
      return null;
    }

    const bridge = api._bridge;

    if (payload.kind === 'ensure') {
      await bridge.waitForCollaborationReady();
      if (payload.clear) {
        await bridge.clear();
      }
      return null;
    }

    await bridge.applySerializedState(payload.stateJson);
    return null;
  }, action);
}

async function waitForRemdoTest(page: Page, timeoutMs = 4000): Promise<void> {
  await page.waitForFunction(() => {
    return Boolean(globalThis.__remdoBridgePromise);
  }, undefined, { timeout: timeoutMs });
}

export async function ensureReady(page: Page, opts: { clear?: boolean } = {}): Promise<void> {
  const { clear = false } = opts;
  await waitForRemdoTest(page);
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
  await waitForRemdoTest(page);
  await runWithRemdoTest(page, { kind: 'waitForSynced' });
}
