import { vi } from 'vitest';

// Keeps the shared default's reduced-motion preference, which Mantine needs to
// schedule no timers (see mantine.tsx), and adds the touch-device signal.
export function setCoarsePointer(coarse: boolean) {
  vi.mocked(globalThis.matchMedia).mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' || (coarse && query.includes('pointer: coarse')),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
