import { resetUserData } from '@/client/app/documents/user-data';
import { clearCurrentUserBootstrapCache } from '@/client/app/documents/current-user-bootstrap';
import { authClient, forgetAuthenticatedSession } from './client';

interface LogoutResult {
  serverSignedOut: boolean;
}

function clearAuthenticatedRuntimeState(): void {
  forgetAuthenticatedSession();
  clearCurrentUserBootstrapCache();
  resetUserData();
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
