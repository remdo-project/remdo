import { resetUserData } from '#client/app/documents/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';
import { clearUnsyncedLocalChanges } from '#collaboration/unsynced-local-changes';
import { clearLocalUserData } from './local-data';
import {
  forgetAuthenticatedSession,
  rememberPendingSignOut,
  revokeServerSession,
} from './client';

const SERVER_SIGN_OUT_TIMEOUT_MS = 1500;
const LOCAL_CLEANUP_TIMEOUT_MS = 2000;

function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  return Promise.race([
    work,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
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
  clearUnsyncedLocalChanges();

  // Stop the collaboration runtime first. It fetches document tokens against the
  // session, so revoking while it is live races a request that then 401s.
  resetUserData();
  forgetAuthenticatedSession();
  clearCurrentUserBootstrapCache();

  // Revocation and local cleanup share no data, so the device is not kept
  // waiting for the sum of both budgets.
  await Promise.all([
    withTimeout(revokeServerSession(), SERVER_SIGN_OUT_TIMEOUT_MS),
    withTimeout(clearLocalData(), LOCAL_CLEANUP_TIMEOUT_MS),
  ]);
}
