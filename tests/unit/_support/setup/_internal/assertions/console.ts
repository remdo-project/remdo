import { afterAll, afterEach, expect, vi } from 'vitest';

const LEVELS = ['error', 'warn'] as const;

const consoleSpies = LEVELS.map((level) => {
  // swallow console noise while recording calls
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  return { level, spy };
});

afterEach(() => {
  for (const { level, spy } of consoleSpies) {
    const hasAllowListedMessage = (arg: unknown) =>
      typeof arg === 'string' &&
      // arg.includes('Invalid access: Add Yjs type to a document before reading data.');
      false;

    const relevantCalls = spy.mock.calls.filter((args) => !args.some(hasAllowListedMessage));

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
  consoleSpies.forEach(({ spy }) => spy.mockRestore());
});
