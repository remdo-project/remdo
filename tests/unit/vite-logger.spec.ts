import path from 'node:path';
import { resolveConfig } from 'vite';
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
  it('preserves Vite log-level filtering', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const config = await resolveConfig({
      configFile: path.resolve('vite.config.mts'),
      logLevel: 'silent',
    }, 'serve');
    const pipeError = networkError('write EPIPE', 'EPIPE');

    config.logger.error(`ws proxy error:\n${pipeError.stack}`, { error: pipeError });

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('classifies expected WebSocket proxy disconnects without error stacks', () => {
    const { info, logError, logger } = createLoggerHarness();
    const customLogger = createViteLogger(logger);
    const pipeError = networkError('write EPIPE', 'EPIPE');

    customLogger.error(`ws proxy error:\n${pipeError.stack}`, { error: pipeError });
    customLogger.error(`ws proxy socket error:\n${pipeError.stack}`, { error: pipeError });

    expect(logError).not.toHaveBeenCalled();
    expect(info).toHaveBeenNthCalledWith(
      1,
      '[vite] WebSocket proxy disconnected: write EPIPE',
      { error: pipeError },
    );
    expect(info).toHaveBeenNthCalledWith(
      2,
      '[vite] WebSocket proxy disconnected: write EPIPE',
      { error: pipeError },
    );
  });

  it('preserves unexpected proxy and Vite errors', () => {
    const { info, logError, logger } = createLoggerHarness();
    const customLogger = createViteLogger(logger);
    const pipeError = networkError('write EPIPE', 'EPIPE');
    const resetError = networkError('read ECONNRESET', 'ECONNRESET');
    const timeoutError = networkError('connect ETIMEDOUT', 'ETIMEDOUT');

    customLogger.error('http proxy error: /api', { error: pipeError });
    customLogger.error('ws proxy error:', { error: resetError });
    customLogger.error('ws proxy error:', { error: timeoutError });
    customLogger.error('build failed');

    expect(info).not.toHaveBeenCalled();
    expect(logError).toHaveBeenNthCalledWith(1, 'http proxy error: /api', { error: pipeError });
    expect(logError).toHaveBeenNthCalledWith(2, 'ws proxy error:', { error: resetError });
    expect(logError).toHaveBeenNthCalledWith(3, 'ws proxy error:', { error: timeoutError });
    expect(logError).toHaveBeenNthCalledWith(4, 'build failed', undefined);
  });
});
