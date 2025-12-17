import type { Page } from '@playwright/test';
import { readFixture } from '#tests-common/fixtures';
import type { RemdoTestApi } from '@/editor/plugins/dev';

export async function load(page: Page, fixtureName: string): Promise<void> {
  const payload = await readFixture(fixtureName);
  await replaceDocument(page, payload);
}

type RemdoTestAction =
  | { kind: 'ensure'; clear: boolean }
  | { kind: 'load'; stateJson: string }
  | { kind: 'getEditorState' }
  | { kind: 'waitForSynced' };

async function runWithRemdoTest(
  page: Page,
  action: Exclude<RemdoTestAction, { kind: 'getEditorState' }>
): Promise<void>;
async function runWithRemdoTest(page: Page, action: Extract<RemdoTestAction, { kind: 'getEditorState' }>): Promise<unknown>;
async function runWithRemdoTest(page: Page, action: RemdoTestAction): Promise<unknown> {
  return page.evaluate(async (payload) => {
    const readyPromise = (globalThis as typeof globalThis & { __remdoBridgePromise?: Promise<RemdoTestApi> })
      .__remdoBridgePromise;
    if (!readyPromise) {
      throw new Error('remdo bridge is not available');
    }

    const api = await readyPromise;

    if (payload.kind === 'getEditorState') {
      return api.getEditorState();
    }

    if (payload.kind === 'waitForSynced') {
      await api.waitForSynced();
      return;
    }

    const bridge = api._bridge;

    if (payload.kind === 'ensure') {
      await bridge.waitForCollaborationReady();
      if (payload.clear) {
        await bridge.clear();
      }
      return;
    }

    await bridge.applySerializedState(payload.stateJson);
  }, action);
}

export async function waitForRemdoTest(page: Page, timeoutMs = 4000): Promise<void> {
  await page.waitForFunction(() => {
    const w = globalThis as typeof globalThis & { __remdoBridgePromise?: Promise<unknown> };
    return Boolean(w.__remdoBridgePromise);
  }, undefined, { timeout: timeoutMs });
}

export async function ensureReady(page: Page, opts: { clear?: boolean } = {}): Promise<void> {
  const { clear = false } = opts;
  await waitForRemdoTest(page);
  await runWithRemdoTest(page, { kind: 'ensure', clear });
}

export async function replaceDocument(page: Page, serializedStateJson: string): Promise<void> {
  await ensureReady(page);
  await runWithRemdoTest(page, { kind: 'load', stateJson: serializedStateJson });
}

export async function getEditorState(page: Page): Promise<unknown> {
  await ensureReady(page);
  return runWithRemdoTest(page, { kind: 'getEditorState' });
}

export async function waitForSynced(page: Page): Promise<void> {
  await waitForRemdoTest(page);
  await runWithRemdoTest(page, { kind: 'waitForSynced' });
}
