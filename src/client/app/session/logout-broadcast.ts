import {
  PENDING_SIGN_OUT_STORAGE_KEY,
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
  // LogoutProvider stays mounted through sign-in, so this latch must clear when
  // the marker is gone or a later peer logout is ignored.
  let delivered = false;
  const deliver = () => {
    if (delivered) {
      return;
    }
    delivered = true;
    onSignOut();
  };
  const rearm = () => {
    delivered = false;
  };

  const onStorage = (event: StorageEvent) => {
    if (isPendingSignOutStorageEvent(event)) {
      deliver();
      return;
    }
    if (event.key === PENDING_SIGN_OUT_STORAGE_KEY || event.key === null) {
      rearm();
    }
  };
  window.addEventListener('storage', onStorage);

  const pollId = window.setInterval(() => {
    if (!hasPendingSignOut()) {
      rearm();
      return;
    }
    if (!originatedPendingSignOut()) {
      deliver();
    }
  }, PEER_SIGN_OUT_POLL_MS);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.clearInterval(pollId);
  };
}
