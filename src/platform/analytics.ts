export const ANALYTICS_CONSENT_GRANTED_EVENT = 'remdo-analytics-consent-granted';

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
let listeningForReady = false;

function flushPendingCalls() {
  const client = window.umami;
  if (!client || window.remdoAnalyticsAllowed !== true) {
    return;
  }
  const calls = pendingCalls.splice(0);
  calls.forEach((call) => call(client));
}

function withAnalytics(call: (client: UmamiClient) => void): boolean {
  if (typeof window === 'undefined' || window.remdoAnalyticsAllowed !== true) {
    return false;
  }
  if (window.umami) {
    call(window.umami);
    return true;
  }
  pendingCalls.push(call);
  if (!listeningForReady) {
    listeningForReady = true;
    window.addEventListener('remdo-analytics-ready', flushPendingCalls);
  }
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
}

/** Whether analytics accepted the event; false means consent has not been granted. */
export function trackAnalyticsEvent(event: AnalyticsEvent): boolean {
  return withAnalytics((client) => client.track(event));
}
