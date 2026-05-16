import { afterEach } from 'vitest';

interface TestResource {
  cleanup: () => void;
}

export function createTestResource<TOptions, TResource extends TestResource>(
  createResource: (options?: TOptions) => TResource,
): (options?: TOptions) => TResource {
  let currentResource: TResource | null = null;

  afterEach(() => {
    currentResource?.cleanup();
    currentResource = null;
  });

  return (options?: TOptions) => {
    currentResource?.cleanup();
    currentResource = createResource(options);
    return currentResource;
  };
}
