export const ANALYTICS_CONSENT_GRANTED_EVENT = 'remdo-analytics-consent-granted';
export const ANALYTICS_READY_EVENT = 'remdo-analytics-ready';

type AnalyticsEvent =
  | 'app-opened'
  | 'document-created'
  | 'document-edited'
  | 'document-imported'
  | 'search-used';

interface UmamiClient {
  identify: (id: string) => void;
  track: (event: AnalyticsEvent) => void;
}

declare global {
  interface Window {
    remdoAnalyticsAllowed?: boolean;
    remdoAnalyticsSuspended?: boolean;
    umami?: UmamiClient;
  }
}

const pendingCalls: Array<(client: UmamiClient) => void> = [];

function flushPendingCalls() {
  const client = window.umami;
  if (!client || window.remdoAnalyticsAllowed !== true) {
    return;
  }
  const calls = pendingCalls.splice(0);
  calls.forEach((call) => call(client));
}

function withAnalytics(call: (client: UmamiClient) => void): boolean {
  if (window.remdoAnalyticsAllowed !== true || window.remdoAnalyticsSuspended === true) {
    return false;
  }
  if (window.umami) {
    flushPendingCalls();
    call(window.umami);
    return true;
  }
  pendingCalls.push(call);
  window.addEventListener(ANALYTICS_READY_EVENT, flushPendingCalls);
  return true;
}

export function identifyAnalyticsUser(userId: string) {
  window.remdoAnalyticsSuspended = false;
  withAnalytics((client) => client.identify(userId));
}

// Umami cannot clear an identity, so the page stops sending until the next
// identify or page load.
export function endAnalyticsIdentity() {
  window.remdoAnalyticsSuspended = true;
  pendingCalls.length = 0;
}

/** Whether analytics accepted the event; false means consent is missing or sending is suspended. */
export function trackAnalyticsEvent(event: AnalyticsEvent): boolean {
  return withAnalytics((client) => client.track(event));
}
