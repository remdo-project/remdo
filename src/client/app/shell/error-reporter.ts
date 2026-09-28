import type { BrowserOptions, Breadcrumb, ErrorEvent } from '@sentry/browser';
import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
} from '@sentry/browser';

export { captureException } from '@sentry/browser';

const TUNNEL_PATH = '/api/error-reports';
const URL_BREADCRUMB_FIELDS = ['url', 'from', 'to'] as const;

function withoutQuery(url: string): string {
  return url.split(/[?#]/, 1)[0]!;
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) {
    event.request.url = withoutQuery(event.request.url);
  }
  return event;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  for (const field of URL_BREADCRUMB_FIELDS) {
    const value: unknown = breadcrumb.data?.[field];
    if (typeof value === 'string') {
      breadcrumb.data![field] = withoutQuery(value);
    }
  }
  return breadcrumb;
}

export function initReporter(options: Pick<BrowserOptions, 'dsn' | 'release' | 'dataCollection'>): void {
  init({
    ...options,
    environment: location.hostname,
    tunnel: TUNNEL_PATH,
    defaultIntegrations: false,
    integrations: [
      eventFiltersIntegration(),
      browserApiErrorsIntegration(),
      breadcrumbsIntegration({ dom: false }),
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      httpContextIntegration(),
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
