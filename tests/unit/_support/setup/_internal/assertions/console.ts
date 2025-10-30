import { afterAll, afterEach, expect, vi } from 'vitest';

const LEVELS = ['error', 'warn'] as const;

const consoleSpies = LEVELS.map((level) => {
  // swallow console noise while recording calls
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  return { level, spy };
});

afterEach(() => {
  for (const { level, spy } of consoleSpies) {
    if (spy.mock.calls.length > 0) {
      const argsPreview = spy.mock.calls
        .map((args) => args.map((arg) => String(arg)).join(' '))
        .join('\n');
      spy.mockClear();
      expect.fail(`console.${level} was called:\n${argsPreview}`);
    }

    spy.mockClear();
  }
});

afterAll(() => {
  consoleSpies.forEach(({ spy }) => spy.mockRestore());
});
