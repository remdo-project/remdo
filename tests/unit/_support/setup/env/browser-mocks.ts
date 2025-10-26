import { vi } from 'vitest';

let mocksInstalled = false;

export function installBrowserMocks(): void {
  if (mocksInstalled) return;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  mocksInstalled = true;
}
