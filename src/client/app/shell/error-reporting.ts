import type { RootOptions } from 'react-dom/client';
import { config } from '#config';
import { ERROR_REPORT_DATA_COLLECTION } from '#platform/error-reporting';
import { getApiConfig } from '#platform/http/api-client';

type Capture = typeof import('./error-reporter').captureException;

let capture: Promise<Capture | void> = Promise.resolve();

async function loadReporter(dsn: string): Promise<Capture> {
  const loaded = await import('./error-reporter');
  loaded.initReporter({
    dsn,
    release: config.env.BUILD_REVISION || undefined,
    dataCollection: ERROR_REPORT_DATA_COLLECTION,
  });
  return loaded.captureException;
}

export function startErrorReporting(): Promise<unknown> {
  capture = getApiConfig()
    .then(async ({ errorReportingDsn }) => errorReportingDsn ? loadReporter(errorReportingDsn) : undefined)
    .catch(() => {});
  return capture;
}

async function reportCaughtError(error: unknown, componentStack: string | undefined): Promise<void> {
  (await capture)?.(error, { contexts: { react: { componentStack } } });
}

export const errorReportingRootOptions: RootOptions = {
  // Uncaught errors reach the global handlers; boundaries such as the editor's
  // would otherwise keep caught ones from being reported.
  onCaughtError: (error, { componentStack }) => {
    void reportCaughtError(error, componentStack);
    // React's default handler, which this replaces, logs caught errors.
    console.error(error);
  },
};
