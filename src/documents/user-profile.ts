import { hasRememberedSession, isLikelyFetchUnavailableError } from '@/auth/client';
import { normalizeDocumentId } from '@/routing';
import {
  clearStoredUserProfile,
  readStoredUserProfile,
  writeStoredUserProfile,
} from './user-profile-storage';

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

export function clearUserProfileCache(): void {
  profilePromise = null;
  clearStoredUserProfile();
}

export async function getHomeDocumentId(): Promise<string> {
  const profile = await getUserProfile();
  return profile.homeDocumentId;
}

async function fetchUserProfile(): Promise<UserProfile> {
  let response: Response;
  try {
    response = await fetch('/api/profile', {
      credentials: 'same-origin',
    });
  } catch (error) {
    if (isLikelyFetchUnavailableError(error)) {
      const cachedProfile = readRememberedCachedUserProfile();
      if (cachedProfile) {
        return cachedProfile;
      }
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Failed to load user profile: ${response.status}`);
  }

  const body = await response.json() as Partial<UserProfile>;
  const profile = parseUserProfile(body);
  writeCachedUserProfile(profile);
  return profile;
}

function parseUserProfile(body: Partial<UserProfile>): UserProfile {
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

function writeCachedUserProfile(profile: UserProfile): void {
  writeStoredUserProfile(JSON.stringify(profile));
}

export function getCachedUserProfile(): UserProfile | null {
  const rawProfile = readStoredUserProfile();
  if (!rawProfile) {
    return null;
  }

  try {
    return parseUserProfile(JSON.parse(rawProfile) as Partial<UserProfile>);
  } catch {
    clearStoredUserProfile();
    return null;
  }
}

function readRememberedCachedUserProfile(): UserProfile | null {
  if (!hasRememberedSession()) {
    return null;
  }
  return getCachedUserProfile();
}
