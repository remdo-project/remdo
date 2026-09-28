import { Buffer } from 'node:buffer';
import process from 'node:process';
import { config } from '#config';
import { ERROR_REPORT_DATA_COLLECTION } from './error-reporting';

const FLUSH_TIMEOUT_MS = 2000;

export async function startServerErrorReporting(): Promise<void> {
  const dsn = config.env.SENTRY_DSN;
  if (config.isTest || !dsn) return;

  const {
    captureException,
    createStackParser,
    createTransport,
    dedupeIntegration,
    flush,
    initAndBind,
    linkedErrorsIntegration,
  } = await import('@sentry/core');
  const { ServerRuntimeClient, nodeStackLineParser } = await import('@sentry/core/server');

  initAndBind(ServerRuntimeClient, {
    dsn,
    release: config.env.BUILD_REVISION || undefined,
    environment: new URL(config.env.APP_ORIGIN).hostname,
    dataCollection: ERROR_REPORT_DATA_COLLECTION,
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: (options) => createTransport(options, async ({ body }) => {
      const response = await fetch(options.url, { method: 'POST', body: Buffer.from(body), headers: options.headers });
      return {
        statusCode: response.status,
        headers: {
          'retry-after': response.headers.get('retry-after'),
          'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'),
        },
      };
    }),
  });

  // Replaces Node's default crash, which unhandled rejections also reach, so
  // it keeps that outcome: the error on stderr and exit status 1.
  let exiting: Promise<unknown> | undefined;
  process.on('uncaughtException', (error) => {
    console.error(error);
    captureException(error, { mechanism: { type: 'onuncaughtexception', handled: false } });
    exiting ??= flush(FLUSH_TIMEOUT_MS).finally(() => process.exit(1));
  });
}
