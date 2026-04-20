import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentRegistryHarness } from './_support/document-registry-harness';

const harnesses: Array<ReturnType<typeof createDocumentRegistryHarness>> = [];

afterEach(() => {
  for (const harness of harnesses) {
    harness.cleanup();
  }
  harnesses.length = 0;
});

function createRegistry() {
  const harness = createDocumentRegistryHarness();
  harnesses.push(harness);
  return harness.registry;
}

describe('document registry', () => {
  it('ensureDocument inserts a missing document', async () => {
    const registry = createRegistry();

    const document = await registry.ensureDocument('main');

    expect(document.id).toBe('main');
    expect(document.accessMode).toBe('private');
    expect(document.createdAt).toBeInstanceOf(Date);
    expect(document.updatedAt).toBeInstanceOf(Date);
    await expect(registry.getDocument('main')).resolves.toEqual(document);
  });

  it('ensureDocument returns an existing document without changing timestamps', async () => {
    const registry = createRegistry();

    const first = await registry.ensureDocument('main');
    const second = await registry.ensureDocument('main');

    expect(second).toEqual(first);
  });

  it('inserted documents default to private', async () => {
    const registry = createRegistry();

    const document = await registry.ensureDocument('notes');

    expect(document.accessMode).toBe('private');
  });
});
