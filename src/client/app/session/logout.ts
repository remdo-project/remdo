import { resetUserData } from '#client/app/user-data/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/user-data/current-user-bootstrap';
import { clearUnsyncedLocalChanges } from '#collaboration/unsynced-local-changes';
import { clearLocalUserData } from './local-data';
import {
  forgetAuthenticatedSession,
  rememberPendingSignOut,
  revokeServerSession,
} from './client';

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
 * Clear local access with bounded work. Unconfirmed server logout remains
 * visible as pending until the user explicitly finishes it or signs in again.
 */
export async function logoutCurrentUser(): Promise<void> {
  rememberPendingSignOut();
  clearUnsyncedLocalChanges();

  // The logout controller has already unmounted the active route. Clear its
  // account metadata before revoking the session and deleting offline data.
  resetUserData();
  forgetAuthenticatedSession();
  clearCurrentUserBootstrapCache();

  // Revocation and local cleanup share no data, so the device is not kept
  // waiting for the sum of both budgets.
  await Promise.all([
    revokeServerSession(),
    withTimeout(clearLocalData(), LOCAL_CLEANUP_TIMEOUT_MS),
  ]);
}
