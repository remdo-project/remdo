import type { Logger } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { createViteLogger } from '../../config/_internal/vite/createViteLogger';

function createLoggerHarness() {
  const info = vi.fn();
  const logError = vi.fn();
  const logger = {
    info,
    warn: vi.fn(),
    warnOnce: vi.fn(),
    error: logError,
    clearScreen: vi.fn(),
    hasErrorLogged: vi.fn(() => false),
    hasWarned: false,
  } satisfies Logger;

  return { info, logError, logger };
}

function networkError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

describe('vite logger', () => {
  it('classifies expected WebSocket proxy disconnects without error stacks', () => {
    const { info, logError, logger } = createLoggerHarness();
    const customLogger = createViteLogger(logger);
    const pipeError = networkError('write EPIPE', 'EPIPE');
    const resetError = networkError('read ECONNRESET', 'ECONNRESET');

    customLogger.error(`ws proxy error:\n${pipeError.stack}`, { error: pipeError });
    customLogger.error(`ws proxy socket error:\n${resetError.stack}`, { error: resetError });

    expect(logError).not.toHaveBeenCalled();
    expect(info).toHaveBeenNthCalledWith(
      1,
      '[vite] WebSocket proxy disconnected: write EPIPE',
      { error: pipeError },
    );
    expect(info).toHaveBeenNthCalledWith(
      2,
      '[vite] WebSocket proxy disconnected: read ECONNRESET',
      { error: resetError },
    );
  });

  it('preserves unexpected proxy and Vite errors', () => {
    const { info, logError, logger } = createLoggerHarness();
    const customLogger = createViteLogger(logger);
    const pipeError = networkError('write EPIPE', 'EPIPE');
    const timeoutError = networkError('connect ETIMEDOUT', 'ETIMEDOUT');

    customLogger.error('http proxy error: /api', { error: pipeError });
    customLogger.error('ws proxy error:', { error: timeoutError });
    customLogger.error('build failed');

    expect(info).not.toHaveBeenCalled();
    expect(logError).toHaveBeenNthCalledWith(1, 'http proxy error: /api', { error: pipeError });
    expect(logError).toHaveBeenNthCalledWith(2, 'ws proxy error:', { error: timeoutError });
    expect(logError).toHaveBeenNthCalledWith(3, 'build failed', undefined);
  });
});
