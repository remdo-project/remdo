import { createUniqueNoteId } from '#lib/editor/note-ids';

const USER_CONFIG_DOC_ID = '__remdo_user_config__';
export const E2E_USER_CONFIG_DOC_ID_KEY = '__remdo_e2e_user_config_doc_id__';

let resolvedUserConfigDocId: string | null = null;

export function getUserConfigDocId(): string {
  resolvedUserConfigDocId ??= resolveUserConfigDocId();
  return resolvedUserConfigDocId;
}

function resolveUserConfigDocId(): string {
  if (typeof location === 'undefined' || !location.pathname.startsWith('/e2e/')) {
    return USER_CONFIG_DOC_ID;
  }

  try {
    const existing = sessionStorage.getItem(E2E_USER_CONFIG_DOC_ID_KEY);
    if (existing) {
      return existing;
    }
    const docId = `${USER_CONFIG_DOC_ID}__${createUniqueNoteId()}`;
    sessionStorage.setItem(E2E_USER_CONFIG_DOC_ID_KEY, docId);
    return docId;
  } catch {
    return `${USER_CONFIG_DOC_ID}__${createUniqueNoteId()}`;
  }
}
