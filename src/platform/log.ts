import { config } from '#config';

/**
 * Dev-only diagnostic logging.
 * Use `reportInvariant(...)` for contract violations or unexpected runtime states.
 */
export function trace(scope: string, message: string, details?: unknown): void {
  if (config.isDev) {
    // eslint-disable-next-line no-console -- Dev-only diagnostic logs.
    console.info(`[${scope}] ${message}`, details);
  }
}
