export const ANALYTICS_TOGGLED_EVENT = 'remdo-analytics-toggled';

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
    umami?: UmamiClient;
    remdoAnalyticsDisabled?: boolean;
    remdoAnalyticsUserId?: string | null;
  }
}

let deliveredUserId: string | null = null;
let listeningForToggles = false;

function deliverIdentity() {
  const userId = window.remdoAnalyticsUserId;
  if (window.remdoAnalyticsDisabled !== true && userId && window.umami && userId !== deliveredUserId) {
    window.umami.identify(userId);
    deliveredUserId = userId;
  }
}

function handleToggle() {
  deliveredUserId = null;
  deliverIdentity();
}

// The before-send hook in the page drops the identity from every payload while
// nobody is signed in, and every payload while statistics are turned off.
export function identifyAnalyticsUser(userId: string) {
  window.remdoAnalyticsUserId = userId;
  if (!listeningForToggles) {
    listeningForToggles = true;
    window.addEventListener(ANALYTICS_TOGGLED_EVENT, handleToggle);
  }
  deliverIdentity();
}

export function endAnalyticsIdentity() {
  window.remdoAnalyticsUserId = null;
  deliveredUserId = null;
}

export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  deliverIdentity();
  window.umami?.track(event);
}
