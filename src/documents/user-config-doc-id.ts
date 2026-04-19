import { createUniqueNoteId } from '#lib/editor/note-ids';
import { getInjectedE2EUserConfigDocId } from '@/testing/e2e-runtime';

export const USER_CONFIG_DOC_ID = 'usercfg';

let resolvedUserConfigDocId: string | null = null;
let fallbackE2EUserConfigDocId: string | null = null;

export function getUserConfigDocId(): string {
  resolvedUserConfigDocId ??= resolveUserConfigDocId();
  return resolvedUserConfigDocId;
}

function resolveUserConfigDocId(): string {
  if (typeof location === 'undefined' || !location.pathname.startsWith('/e2e/')) {
    return USER_CONFIG_DOC_ID;
  }

  const injectedDocId = getInjectedE2EUserConfigDocId();
  if (injectedDocId) {
    return injectedDocId;
  }

  fallbackE2EUserConfigDocId ??= `${USER_CONFIG_DOC_ID}${createUniqueNoteId()}`;
  return fallbackE2EUserConfigDocId;
}
