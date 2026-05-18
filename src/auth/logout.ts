import { resetUserConfig } from '@/documents/user-config';
import { clearUserProfileCache } from '@/documents/user-profile';
import { authClient, forgetAuthenticatedSession } from './client';

export function clearAuthenticatedClientState(): void {
  forgetAuthenticatedSession();
  clearUserProfileCache();
  resetUserConfig();
}

export async function logoutCurrentUser(): Promise<void> {
  const result = await authClient.signOut();
  if (result.error) {
    throw result.error;
  }
  clearAuthenticatedClientState();
}
