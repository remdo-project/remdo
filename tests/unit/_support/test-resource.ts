import { afterEach } from 'vitest';

interface TestResource {
  cleanup: () => Promise<void> | void;
}

export function createTestResource<TOptions, TResource extends TestResource>(
  createResource: (options?: TOptions) => TResource,
): (options?: TOptions) => TResource {
  let currentResource: TResource | null = null;

  afterEach(async () => {
    await currentResource?.cleanup();
    currentResource = null;
  });

  return (options?: TOptions) => {
    void currentResource?.cleanup();
    currentResource = createResource(options);
    return currentResource;
  };
}
