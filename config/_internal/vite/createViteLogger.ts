// Vite's dev-server proxy logs routine WebSocket teardown (`EPIPE`/`ECONNRESET`)
// as errors with stacks; this wrapper reclassifies only those disconnects.
import { createLogger } from 'vite';
import type { LogErrorOptions, Logger } from 'vite';

const expectedWebSocketCloseCodes = new Set(['ECONNRESET', 'EPIPE']);

function expectedWebSocketDisconnect(
  message: string,
  error: LogErrorOptions['error'],
): string | null {
  if (
    !message.includes('ws proxy error:')
    && !message.includes('ws proxy socket error:')
  ) {
    return null;
  }

  if (!error || !('code' in error)) return null;

  return typeof error.code === 'string' && expectedWebSocketCloseCodes.has(error.code)
    ? error.message
    : null;
}

export function createViteLogger(logger: Logger = createLogger()): Logger {
  const logError = logger.error.bind(logger);

  logger.error = (message, options) => {
    const disconnect = expectedWebSocketDisconnect(message, options?.error);
    if (disconnect) {
      logger.info(`[vite] WebSocket proxy disconnected: ${disconnect}`, options);
      return;
    }

    logError(message, options);
  };

  return logger;
}
