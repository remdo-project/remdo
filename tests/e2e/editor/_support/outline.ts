import { expect } from '#e2e/fixtures';
import type { Outline } from '#tests-common/outline';
import { extractOutlineFromEditorState } from '#tests-common/outline';

interface EditorLike {
  getEditorState: () => Promise<unknown>;
}

export async function expectOutline(target: EditorLike, expected: Outline) {
  await expect
    .poll(async () => extractOutlineFromEditorState(await target.getEditorState()))
    .toEqual(expected);
}
