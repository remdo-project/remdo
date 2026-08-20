import {
  hasPendingSignOut,
  isPendingSignOutStorageEvent,
  originatedPendingSignOut,
} from './client';

const PEER_SIGN_OUT_POLL_MS = 50;

/**
 * Other tabs learn of a sign-out from the pending-sign-out marker the
 * originating tab writes. A `storage` event is the prompt path; some browsers
 * omit that event between same-origin tabs, so peers also poll the shared
 * marker and skip the tab that wrote it.
 */
export function subscribeToSignOut(onSignOut: () => void): () => void {
  let delivered = false;
  let pollId = 0;
  const deliver = () => {
    if (delivered) {
      return;
    }
    delivered = true;
    window.clearInterval(pollId);
    onSignOut();
  };

  const onStorage = (event: StorageEvent) => {
    if (isPendingSignOutStorageEvent(event)) {
      deliver();
    }
  };
  window.addEventListener('storage', onStorage);

  pollId = window.setInterval(() => {
    if (hasPendingSignOut() && !originatedPendingSignOut()) {
      deliver();
    }
  }, PEER_SIGN_OUT_POLL_MS);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.clearInterval(pollId);
  };
}
