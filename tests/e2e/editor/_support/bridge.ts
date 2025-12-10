import type { Page } from '@playwright/test';
import { readFixture } from '../../../_support/fixtures';

export async function load(page: Page, fixtureName: string): Promise<void> {
  const payload = await readFixture(fixtureName);
  await replaceDocument(page, payload);
}

type RemdoTestAction =
  | { kind: 'ensure'; clear: boolean }
  | { kind: 'load'; stateJson: string };

async function runWithRemdoTest(page: Page, action: RemdoTestAction): Promise<void> {
  await page.evaluate(async (payload) => {
    const readyPromise: Promise<any> =
      (globalThis as typeof globalThis & { __remdoBridgePromise?: Promise<unknown> }).__remdoBridgePromise
      ?? Promise.reject(new Error('remdo bridge is not available'));

    const api = await readyPromise;
    if (!api || !api._bridge) {
      throw new Error('remdo bridge is not available');
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
