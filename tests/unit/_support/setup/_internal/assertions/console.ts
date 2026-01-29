import { afterAll, afterEach, expect, vi } from 'vitest';
import {
  clearExpectedConsoleIssues,
  consumeExpectedConsoleIssue,
  getExpectedConsoleIssues,
} from './console-allowlist';

const LEVELS = ['error', 'warn'] as const;
const consoleSpies = LEVELS.map((level) => {
  // swallow console noise while recording calls
  const spy = vi.spyOn(console, level).mockImplementation(() => { });
  return { level, spy };
});

afterEach(() => {
  const expectedIssues = getExpectedConsoleIssues();
  for (const { level, spy } of consoleSpies) {
    const relevantCalls = expectedIssues
      ? spy.mock.calls.filter((args) => {
          const message = typeof args[0] === 'string' ? args[0] : '';
          return !consumeExpectedConsoleIssue(message);
        })
      : spy.mock.calls;

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
      spy.mockClear();
      expect.fail(`console.${level} was called:\n${argsPreview}`);
    }

    spy.mockClear();
  }
  if (expectedIssues && expectedIssues.size > 0) {
    clearExpectedConsoleIssues();
    expect.fail(`Expected console issues not reported: ${[...expectedIssues].join(', ')}`);
  }
  clearExpectedConsoleIssues();
});

afterAll(() => {
  for (const { spy } of consoleSpies) spy.mockRestore();
});
