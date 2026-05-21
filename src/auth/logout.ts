import { resetUserConfig } from '@/documents/user-config';
import { clearUserProfileCache } from '@/documents/user-profile';
import { authClient, forgetAuthenticatedSession } from './client';
import { clearLocalUserData, markLocalUserDataCleanupPending } from './local-data';

function clearAuthenticatedRuntimeState(): void {
  forgetAuthenticatedSession();
  clearUserProfileCache();
  resetUserConfig();
}

export async function clearAuthenticatedClientState(): Promise<void> {
  clearAuthenticatedRuntimeState();
  await clearLocalUserData();
}

export async function logoutCurrentUser(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // Server sign-out can fail offline; still clear local auth state.
  }

  clearAuthenticatedRuntimeState();
  try {
    await clearLocalUserData();
  } catch {
    markLocalUserDataCleanupPending();
  }
}
