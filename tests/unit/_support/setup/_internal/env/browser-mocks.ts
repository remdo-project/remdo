import { vi } from 'vitest';

Object.defineProperty(globalThis, 'matchMedia', {
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

// TODO: jsdom's `Range` omits getBoundingClientRect, but Lexical calls it when
// scrolling collapsed selections into view. No-op shim avoids noisy errors.
// Obsolete when jsdom implements it (or Lexical stops calling it): delete this
// block and run `pnpm run test:unit:full`.
// eslint-disable-next-line ts/no-unnecessary-condition
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  });
}

const MockResizeObserver = class MockResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
};
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  MockResizeObserver;

// TODO: Lexical's clipboard helpers reference `DragEvent` for instance checks;
// jsdom doesn't provide it. Obsolete when jsdom adds it (or the checks
// disappear): delete this block and run `pnpm run test:unit:full`.
if (typeof DragEvent === 'undefined') {
  const MockDragEvent = class MockDragEvent extends Event {};
  (globalThis as typeof globalThis & { DragEvent: typeof DragEvent }).DragEvent =
    MockDragEvent as unknown as typeof DragEvent;
}

// TODO: jsdom lacks a usable `ClipboardEvent` with `clipboardData`. Obsolete
// when jsdom provides enough native support for these tests: delete this block
// and run `pnpm run test:unit:full`.
if (typeof ClipboardEvent === 'undefined') {
  const MockClipboardEvent = class MockClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;

    constructor(type: string, init?: ClipboardEventInit) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  };

  (globalThis as typeof globalThis & { ClipboardEvent: typeof ClipboardEvent }).ClipboardEvent =
    MockClipboardEvent as unknown as typeof ClipboardEvent;
}
