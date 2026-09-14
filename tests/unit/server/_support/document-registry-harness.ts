import { createServerDatabaseClient } from '#server/db/client';
import { createDocumentRegistry } from '#server/documents/document-registry';

interface DocumentRegistryHarness {
  client: Awaited<ReturnType<typeof createServerDatabaseClient>>;
  cleanup: () => Promise<void>;
  registry: ReturnType<typeof createDocumentRegistry>;
}

export async function createDocumentRegistryHarness(): Promise<DocumentRegistryHarness> {
  const client = await createServerDatabaseClient({ dbPath: ':memory:' });
  const registry = createDocumentRegistry({ client });

  return {
    client,
    registry,
    async cleanup() {
      await client.close();
    },
  };
}
