import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

function readFixtureJson(fixtureName: string): string {
  const abs = path.resolve('tests/fixtures', `${fixtureName}.json`);
  return fs.readFileSync(abs, 'utf8');
}

export async function load(page: Page, fixtureName: string): Promise<void> {
  const payload = readFixtureJson(fixtureName);
  await replaceDocument(page, payload);
}

interface RemdoTestApi {
  waitForCollaborationReady: () => Promise<void>;
  clear: () => Promise<void>;
  applySerializedState: (input: string) => Promise<void>;
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

export async function ensureReady(page: Page, opts: { clear?: boolean } = {}): Promise<void> {
  const { clear = false } = opts;
  await runWithRemdoTest(page, { kind: 'ensure', clear });
}

export async function replaceDocument(page: Page, serializedStateJson: string): Promise<void> {
  await ensureReady(page);
  await runWithRemdoTest(page, { kind: 'load', stateJson: serializedStateJson });
}
