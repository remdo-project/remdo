import { createServerDatabaseClient } from '@/server/db/client';
import { createDocumentRegistry } from '@/server/documents/document-registry';

interface DocumentRegistryHarness {
  client: ReturnType<typeof createServerDatabaseClient>;
  cleanup: () => Promise<void>;
  registry: ReturnType<typeof createDocumentRegistry>;
}

export function createDocumentRegistryHarness(): DocumentRegistryHarness {
  const client = createServerDatabaseClient({ dbPath: ':memory:' });
  const registry = createDocumentRegistry({ client });

  return {
    client,
    registry,
    async cleanup() {
      await client.close();
    },
  };
}
