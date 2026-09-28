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
  capture = getApiConfig().then(
    async ({ errorReportingDsn }) => errorReportingDsn ? loadReporter(errorReportingDsn) : undefined,
    () => {},
  );
  return capture;
}

export async function reportRenderError(error: unknown, componentStack: string | undefined): Promise<void> {
  (await capture)?.(error, { contexts: { react: { componentStack } } });
}
