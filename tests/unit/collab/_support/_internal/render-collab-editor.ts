import { config } from '#config';
import { env } from 'node:process';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { renderRemdoEditor } from '../render-editor';

let peerCounter = 0;

export async function renderCollabEditor(options?: { docId?: string }): Promise<RemdoTestApi> {
  const workerId = env.VITEST_WORKER_ID || '0';
  const docId =
    (options && options.docId) ||
    config.env.COLLAB_DOCUMENT_ID ||
    `collab-peer-${workerId}-${peerCounter++}`;

  const { api } = await renderRemdoEditor({ docId });
  return api;
}
