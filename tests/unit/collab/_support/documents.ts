import { vi } from 'vitest';
import { config } from '#config';
import { createServerDatabaseClient } from '#server/db/client';
import { createDocumentRegistry } from '#server/documents/document-registry';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { getCollabTestSessionCookie } from './auth';

async function insertCollabTestDocument(docId: string): Promise<void> {
  const client = createServerDatabaseClient();
  try {
    const owner = client.sqlite
      .prepare('SELECT id FROM "user" WHERE email = ? LIMIT 1')
      .get(TEST_AUTH_ACCOUNT.email) as { id: string } | undefined;
    if (!owner) {
      throw new Error(`Collab test user ${TEST_AUTH_ACCOUNT.email} missing from auth DB.`);
    }

    const registry = createDocumentRegistry({ client });
    await registry.insertDocument({
      id: docId,
      ownerUserId: owner.id,
      title: docId,
    });
  } finally {
    await client.close();
  }
}

export async function ensureCollabTestDocument(docId: string): Promise<void> {
  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  await getCollabTestSessionCookie();
  await vi.waitFor(async () => {
    await insertCollabTestDocument(docId);
  });
}
