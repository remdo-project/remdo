import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest';

const LEVELS = ['error', 'warn'] as const;

type ConsoleLevel = (typeof LEVELS)[number];

let installed = false;

export function registerConsoleGuards(): void {
  if (installed) return;
  installed = true;

  const spies = new Map<ConsoleLevel, ReturnType<typeof vi.spyOn>>(
    LEVELS.map((level) => {
      const spy = vi.spyOn(console, level).mockImplementation(() => {
        // no-op: prevent noisy output while keeping call metadata
      });
      return [level, spy];
    })
  );

  beforeEach(() => {
    // do nothing; we intentionally keep previous calls until validated in afterEach
  });

  afterEach(() => {
    for (const level of LEVELS) {
      const spy = spies.get(level);
      if (!spy) continue;

      const relevantCalls = spy.mock.calls.filter((args) =>
        !args.some((arg) => typeof arg === 'string' && arg.includes('Invalid access: Add Yjs type to a document before reading data.'))
      );

      if (relevantCalls.length > 0) {
        const argsPreview = relevantCalls
          .map((args) => args.map((arg) => String(arg)).join(' '))
          .join('\n');
        spy.mockClear();
        expect.fail(`console.${level} was called:\n${argsPreview}`);
      }

      spy.mockClear();
    }
  });

  afterAll(() => {
    for (const spy of spies.values()) {
      spy.mockRestore();
    }
    spies.clear();
  });
}
