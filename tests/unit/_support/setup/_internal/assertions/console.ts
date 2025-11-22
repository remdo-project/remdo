import { afterAll, afterEach, expect, vi } from 'vitest';

const LEVELS = ['error', 'warn'] as const;

const consoleSpies = LEVELS.map((level) => {
  // swallow console noise while recording calls
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  return { level, spy };
});

afterEach(() => {
  for (const { level, spy } of consoleSpies) {
    const relevantCalls = spy.mock.calls;

    if (relevantCalls.length > 0) {
      const argsPreview = relevantCalls
        .map((args) =>
          args
            .map((arg) => {
              if (arg instanceof Error) {
                return arg.stack ?? arg.message;
              }
              return String(arg);
            })
            .join(' ')
        )
        .join('\n');
      const isAllowedLexicalNoise =
        // TODO: eliminate the underlying Lexical/Yjs node reuse that triggers this dev-only warning, then remove this allowlist.
        typeof argsPreview === 'string' &&
        argsPreview.includes('Lexical node does not exist in active editor state');
      spy.mockClear();
      if (!isAllowedLexicalNoise) {
        expect.fail(`console.${level} was called:\n${argsPreview}`);
      }
    }

    spy.mockClear();
  }
});

afterAll(() => {
  for (const { spy } of consoleSpies) spy.mockRestore();
});
