import { afterEach } from 'vitest';

interface TestResource {
  cleanup: () => Promise<void> | void;
}

export function createTestResource<TOptions, TResource extends TestResource>(
  createResource: (options?: TOptions) => TResource,
): (options?: TOptions) => TResource {
  let resources: TResource[] = [];

  afterEach(async () => {
    // Every resource is cleaned up here, awaited — a fire-and-forget cleanup
    // when a test creates a second resource races the rest of the test.
    const pending = resources;
    resources = [];
    for (const resource of pending) {
      await resource.cleanup();
    }
  });

  return (options?: TOptions) => {
    const resource = createResource(options);
    resources.push(resource);
    return resource;
  };
}
