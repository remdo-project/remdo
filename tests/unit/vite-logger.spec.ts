import path from 'node:path';
import { createLogger, resolveConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViteLogger } from '../../config/_internal/vite/createViteLogger';

function networkError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

describe('vite logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createViteLogger(createLogger());
    const pipeError = networkError('write EPIPE', 'EPIPE');
    const resetError = networkError('read ECONNRESET', 'ECONNRESET');

    logger.error(`ws proxy error:\n${pipeError.stack}`, { error: pipeError });
    logger.error(`ws proxy socket error:\n${resetError.stack}`, { error: resetError });

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenNthCalledWith(1, '[vite] WebSocket proxy disconnected: write EPIPE');
    expect(consoleLog).toHaveBeenNthCalledWith(2, '[vite] WebSocket proxy disconnected: read ECONNRESET');
  });

  it('preserves unexpected proxy and Vite errors', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createViteLogger(createLogger());
    const pipeError = networkError('write EPIPE', 'EPIPE');
    const timeoutError = networkError('connect ETIMEDOUT', 'ETIMEDOUT');

    logger.error('http proxy error: /api', { error: pipeError });
    logger.error('ws proxy error:', { error: timeoutError });
    logger.error('build failed');

    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenNthCalledWith(1, 'http proxy error: /api');
    expect(consoleError).toHaveBeenNthCalledWith(2, 'ws proxy error:');
    expect(consoleError).toHaveBeenNthCalledWith(3, 'build failed');
  });
});
