export const ANALYTICS_CONSENT_GRANTED_EVENT = 'remdo-analytics-consent-granted';
export const ANALYTICS_READY_EVENT = 'remdo-analytics-ready';
export const ANALYTICS_CONSENT_WITHDRAWN_EVENT = 'remdo-analytics-consent-withdrawn';

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
let userId: string | null = null;
let deliveredUserId: string | null = null;

function deliverIdentity(client: UmamiClient) {
  if (userId !== null && userId !== deliveredUserId) {
    client.identify(userId);
    deliveredUserId = userId;
  }
}

function flushPendingCalls() {
  const client = window.umami;
  if (!client || window.remdoAnalyticsAllowed !== true) {
    return;
  }
  deliverIdentity(client);
  pendingCalls.splice(0).forEach((call) => call(client));
}

function clearPendingCalls() {
  pendingCalls.length = 0;
}

function waitForTracker() {
  window.addEventListener(ANALYTICS_READY_EVENT, flushPendingCalls);
  window.addEventListener(ANALYTICS_CONSENT_WITHDRAWN_EVENT, clearPendingCalls);
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
  waitForTracker();
  return true;
}

// The user is remembered before consent so that whichever event is reported
// first is preceded by the identity, whatever order callers act in.
export function identifyAnalyticsUser(id: string) {
  userId = id;
  window.remdoAnalyticsSuspended = false;
  withAnalytics(() => {});
}

// Umami cannot clear an identity, so the page stops sending until the next
// identify or page load.
export function endAnalyticsIdentity() {
  window.remdoAnalyticsSuspended = true;
  userId = null;
  deliveredUserId = null;
  clearPendingCalls();
}

/** Whether analytics accepted the event; false means consent is missing or sending is suspended. */
export function trackAnalyticsEvent(event: AnalyticsEvent): boolean {
  return withAnalytics((client) => client.track(event));
}
