const USER_PROFILE_STORAGE_KEY = 'remdo-user-profile';

function getUserProfileStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function clearStoredUserProfile(): void {
  getUserProfileStorage()?.removeItem(USER_PROFILE_STORAGE_KEY);
}

export function readStoredUserProfile(): string | null {
  return getUserProfileStorage()?.getItem(USER_PROFILE_STORAGE_KEY) ?? null;
}

export function writeStoredUserProfile(profile: string): void {
  getUserProfileStorage()?.setItem(USER_PROFILE_STORAGE_KEY, profile);
}
