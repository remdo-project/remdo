import { vi } from 'vitest';

export function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    /* eslint-disable ts/no-deprecated -- MediaQueryList's type still requires the legacy listener methods. */
    addListener: vi.fn(),
    removeListener: vi.fn(),
    /* eslint-enable ts/no-deprecated */
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

// Keeps the shared default's reduced-motion preference, which Mantine needs to
// schedule no timers (see mantine.tsx), and adds the touch-device signal.
export function setCoarsePointer(coarse: boolean) {
  vi.mocked(globalThis.matchMedia).mockImplementation((query) => mediaQueryList(
    query,
    query === '(prefers-reduced-motion: reduce)' || (coarse && query.includes('pointer: coarse')),
  ));
}
