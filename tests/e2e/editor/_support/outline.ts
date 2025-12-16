import type { Page } from '#e2e/fixtures';
import { expect } from '#e2e/fixtures';
import type { Outline } from '#tests-common/outline';
import { extractOutlineFromEditorState } from '#tests-common/outline';
import { getEditorState } from './bridge';

interface EditorLike {
  page: Page;
}

export async function expectOutline(target: Page | EditorLike, expected: Outline, opts?: { timeoutMs?: number }) {
  const page = 'page' in target ? target.page : target;
  const timeoutMs = opts?.timeoutMs ?? 2000;

  await expect
    .poll(async () => extractOutlineFromEditorState(await getEditorState(page)), { timeout: timeoutMs })
    .toEqual(expected);
}
