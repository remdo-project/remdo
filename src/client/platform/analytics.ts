export const ANALYTICS_CONSENT_GRANTED_EVENT = 'remdo-analytics-consent-granted';

type AnalyticsEvent = 'app-opened' | 'document-created' | 'search-used';

interface UmamiClient {
  identify: (id: string) => void;
  track: (event: AnalyticsEvent) => void;
}

declare global {
  interface Window {
    remdoAnalyticsAllowed?: boolean;
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

function withAnalytics(call: (client: UmamiClient) => void) {
  if (typeof window === 'undefined' || window.remdoAnalyticsAllowed !== true) {
    return;
  }
  if (window.umami) {
    call(window.umami);
    return;
  }
  pendingCalls.push(call);
  if (!listeningForReady) {
    listeningForReady = true;
    window.addEventListener('remdo-analytics-ready', flushPendingCalls);
  }
}

export function identifyAnalyticsUser(userId: string) {
  withAnalytics((client) => client.identify(userId));
}

export function trackAnalyticsEvent(event: AnalyticsEvent) {
  withAnalytics((client) => client.track(event));
}
