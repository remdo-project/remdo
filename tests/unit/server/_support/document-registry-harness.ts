import { createServerDatabaseClient } from '@/server/db/client';
import { createDocumentRegistry } from '@/server/documents/document-registry';

interface DocumentRegistryHarness {
  cleanup: () => void;
  registry: ReturnType<typeof createDocumentRegistry>;
}

export function createDocumentRegistryHarness(): DocumentRegistryHarness {
  const client = createServerDatabaseClient({ dbPath: ':memory:' });
  const registry = createDocumentRegistry({ client });

  return {
    registry,
    cleanup() {
      client.close();
    },
  };
}
