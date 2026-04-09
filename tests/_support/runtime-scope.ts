import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '#config';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { USER_CONFIG_DOC_ID } from '@/documents/user-config-doc-id';

type TestRuntimeDocKind = 'editor' | 'user-config';

export async function cleanupCollabDoc(docId: string): Promise<void> {
  const docPath = path.join(config.env.DATA_DIR, 'collab', docId);
  await fs.rm(docPath, { recursive: true, force: true });
}

class TestRuntimeScope {
  private readonly ownedDocIds = new Set<string>();

  private ownDocId(docId: string): string {
    this.ownedDocIds.add(docId);
    return docId;
  }

  allocateDocId(kind: TestRuntimeDocKind): string {
    const docId = kind === 'user-config'
      ? `${USER_CONFIG_DOC_ID}__${createUniqueNoteId()}`
      : createUniqueNoteId();
    return this.ownDocId(docId);
  }

  async cleanupOwnedDocs(): Promise<void> {
    const docIds = [...this.ownedDocIds];
    this.ownedDocIds.clear();
    await Promise.all(docIds.map((docId) => cleanupCollabDoc(docId)));
  }
}

export function createTestRuntimeScope(): TestRuntimeScope {
  return new TestRuntimeScope();
}
