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

// jsdom's Range omits getBoundingClientRect, but Lexical calls it when scrolling
// collapsed selections into view. Provide a no-op shim to avoid noisy errors.
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

// Lexical's clipboard helpers reference DragEvent for instance checks; jsdom doesn't provide it.
if (typeof DragEvent === 'undefined') {
  const MockDragEvent = class MockDragEvent extends Event {};
  (globalThis as typeof globalThis & { DragEvent: typeof DragEvent }).DragEvent =
    MockDragEvent as unknown as typeof DragEvent;
}

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
