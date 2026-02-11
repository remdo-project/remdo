import { config } from '#config';
import { normalizeNoteId } from '#lib/editor/note-ids';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { renderRemdoEditor } from '../render-editor';

function resolveDocId(rawDocId: string): string {
  const normalized = normalizeNoteId(rawDocId);
  if (normalized) {
    return normalized;
  }
  throw new Error(`Invalid collab peer doc id: ${rawDocId}`);
}

export async function renderCollabEditor(options?: { docId?: string }): Promise<RemdoTestApi> {
  const explicitDocId = options?.docId;
  const docId = explicitDocId
    ? resolveDocId(explicitDocId)
    : resolveDocId(config.env.COLLAB_DOCUMENT_ID);

  const { api } = await renderRemdoEditor({ docId });
  return api;
}
