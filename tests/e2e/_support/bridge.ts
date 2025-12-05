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

export async function replaceDocument(page: Page, serializedStateJson: string): Promise<void> {
  await page.evaluate(async (stateJson) => {
    const api = (globalThis as typeof globalThis & {
      remdoTest?: { waitForCollaborationReady: () => Promise<void>; applySerializedState: (input: string) => Promise<void> };
    }).remdoTest;
    if (!api) throw new Error('remdoTest is not available');
    await api.waitForCollaborationReady();
    await api.applySerializedState(stateJson);
  }, serializedStateJson);
}
