import { config } from '#config';
import { normalizeNoteIdOrThrow } from '@/domain/notes/ids';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { renderRemdoEditor } from '../render-editor';

export async function renderCollabEditor(options?: { docId?: string }): Promise<RemdoTestApi> {
  const rawDocId = options?.docId ?? config.env.DEV_DOCUMENT_ID;
  const docId = normalizeNoteIdOrThrow(rawDocId, `Invalid collab peer doc id: ${rawDocId}`);

  const { api } = await renderRemdoEditor(docId);
  return api;
}
