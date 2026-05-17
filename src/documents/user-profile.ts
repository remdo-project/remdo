import { normalizeDocumentId } from '@/routing';

export interface UserProfile {
  homeDocumentId: string;
  configDocumentId: string;
}

let profilePromise: Promise<UserProfile> | null = null;

export async function getUserProfile(): Promise<UserProfile> {
  profilePromise ??= fetchUserProfile().catch((error) => {
    profilePromise = null;
    throw error;
  });
  return profilePromise;
}

export async function getHomeDocumentId(): Promise<string> {
  const profile = await getUserProfile();
  return profile.homeDocumentId;
}

async function fetchUserProfile(): Promise<UserProfile> {
  const response = await fetch('/api/profile', {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Failed to load user profile: ${response.status}`);
  }

  const body = await response.json() as Partial<UserProfile>;
  const configDocumentId = normalizeDocumentId(body.configDocumentId);
  const homeDocumentId = normalizeDocumentId(body.homeDocumentId);
  if (!configDocumentId || !homeDocumentId) {
    throw new TypeError('User profile returned invalid document ids.');
  }
  return {
    homeDocumentId,
    configDocumentId,
  };
}
