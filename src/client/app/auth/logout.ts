import { resetUserData } from '#client/app/documents/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';
import { clearLocalUserData } from './local-data';
import {
  authClient,
  forgetAuthenticatedSession,
  forgetPendingSignOut,
  rememberPendingSignOut,
} from './client';

const SERVER_SIGN_OUT_TIMEOUT_MS = 1500;
const LOCAL_CLEANUP_TIMEOUT_MS = 2000;

function afterTimeout(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

async function signOutOnServer(): Promise<void> {
  try {
    const result = await authClient.signOut();
    if (result.error) {
      throw result.error;
    }
    forgetPendingSignOut();
  } catch {
    // The cookie stays valid, so the next reachable revalidation would sign this
    // device back in. Retry on the next gate check instead.
    rememberPendingSignOut();
  }
}

async function clearLocalData(): Promise<void> {
  try {
    await clearLocalUserData();
  } catch {
    // Deleting the offline key alone makes any residue undecryptable, so a
    // database that refuses to drop cannot keep the user signed in.
  }
}

/**
 * Sign out on this device. Always succeeds: every step is bounded, and a failure
 * to reach the server or to drop a database never leaves the user signed in.
 */
export async function logoutCurrentUser(): Promise<void> {
  rememberPendingSignOut();

  // Stop the collaboration runtime first. It fetches document tokens against the
  // session, so revoking while it is live races a request that then 401s.
  resetUserData();
  forgetAuthenticatedSession();
  clearCurrentUserBootstrapCache();

  await Promise.race([signOutOnServer(), afterTimeout(SERVER_SIGN_OUT_TIMEOUT_MS)]);
  await Promise.race([clearLocalData(), afterTimeout(LOCAL_CLEANUP_TIMEOUT_MS)]);
}
