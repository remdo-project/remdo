const CURRENT_USER_BOOTSTRAP_STORAGE_KEY = 'remdo-current-user-bootstrap';

function getCurrentUserBootstrapStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function clearStoredCurrentUserBootstrap(): void {
  getCurrentUserBootstrapStorage()?.removeItem(CURRENT_USER_BOOTSTRAP_STORAGE_KEY);
}

export function readStoredCurrentUserBootstrap(): string | null {
  return getCurrentUserBootstrapStorage()?.getItem(CURRENT_USER_BOOTSTRAP_STORAGE_KEY) ?? null;
}

export function writeStoredCurrentUserBootstrap(bootstrap: string): void {
  getCurrentUserBootstrapStorage()?.setItem(CURRENT_USER_BOOTSTRAP_STORAGE_KEY, bootstrap);
}
