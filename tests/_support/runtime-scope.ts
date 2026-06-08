import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '#config';
import { createUniqueNoteId } from '@/domain/notes/ids';

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

  allocateDocId(): string {
    return this.ownDocId(createUniqueNoteId());
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
