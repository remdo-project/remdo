import type { Page } from '@playwright/test';
import type { RemdoTestApi } from '@/editor/plugins/dev/TestBridgePlugin';
import { readFixture } from '../../_support/fixtures';

export async function load(page: Page, fixtureName: string): Promise<void> {
  const payload = await readFixture(fixtureName);
  await replaceDocument(page, payload);
}

type RemdoTestAction =
  | { kind: 'ensure'; clear: boolean }
  | { kind: 'load'; stateJson: string };

async function runWithRemdoTest(page: Page, action: RemdoTestAction): Promise<void> {
  await page.evaluate(async (payload) => {
    const api = (globalThis as typeof globalThis & { remdoTest?: RemdoTestApi }).remdoTest;
    if (!api) throw new Error('remdoTest is not available');

    if (payload.kind === 'ensure') {
      await api.waitForCollaborationReady();
      if (payload.clear) {
        await api.clear();
      }
      return;
    }

    await api.applySerializedState(payload.stateJson);
  }, action);
}

export async function waitForRemdoTest(page: Page, timeoutMs = 4000): Promise<void> {
  await page.waitForFunction(
    () => Boolean((globalThis as typeof globalThis & { remdoTest?: RemdoTestApi }).remdoTest),
    undefined,
    { timeout: timeoutMs }
  );
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
