import { resetUserConfig } from '@/documents/user-config';
import { clearUserProfileCache } from '@/documents/user-profile';
import { authClient, forgetAuthenticatedSession } from './client';

interface LogoutResult {
  serverSignedOut: boolean;
}

function clearAuthenticatedRuntimeState(): void {
  forgetAuthenticatedSession();
  clearUserProfileCache();
  resetUserConfig();
}

async function signOutOnServer(): Promise<void> {
  const result = await authClient.signOut();
  if (result.error) {
    throw result.error;
  }
}

export async function logoutCurrentUser(): Promise<LogoutResult> {
  clearAuthenticatedRuntimeState();
  try {
    await signOutOnServer();
    return { serverSignedOut: true };
  } catch {
    return { serverSignedOut: false };
  }
}
