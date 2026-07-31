// Vite's dev-server proxy logs routine WebSocket disconnects as errors with
// stacks; this wrapper keeps their signal while dropping the stack noise.
import type { LogErrorOptions, Logger } from 'vite';

function expectedWebSocketDisconnect(
  message: string,
  error: LogErrorOptions['error'],
): boolean {
  if (
    !message.includes('ws proxy error:')
    && !message.includes('ws proxy socket error:')
  ) {
    return false;
  }

  if (!error || !('code' in error)) return false;

  return error.code === 'ECONNRESET' || error.code === 'EPIPE';
}

export function createViteLogger(logger: Logger): Logger {
  const logError = logger.error.bind(logger);

  logger.error = (message, options) => {
    const error = options?.error;
    if (error && expectedWebSocketDisconnect(message, error)) {
      logger.info(`[vite] WebSocket proxy disconnected: ${error.message}`, options);
      return;
    }

    logError(message, options);
  };

  return logger;
}
