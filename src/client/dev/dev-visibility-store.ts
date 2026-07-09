import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'remdo-dev-tooling-visible';
const HIDDEN_STORAGE_VALUE = 'hidden';
const DEFAULT_VISIBLE = true;

const listeners = new Set<() => void>();
let storageListenerAttached = false;
let visibleSnapshot = readStoredVisibility();

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readStoredVisibility(): boolean {
  return getStorage()?.getItem(STORAGE_KEY) !== HIDDEN_STORAGE_VALUE;
}

function writeStoredVisibility(visible: boolean): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  if (visible === DEFAULT_VISIBLE) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  storage.setItem(STORAGE_KEY, HIDDEN_STORAGE_VALUE);
}

function emitVisibilityChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  visibleSnapshot = readStoredVisibility();
  emitVisibilityChange();
}

function ensureStorageListener(): void {
  if (storageListenerAttached || typeof window === 'undefined') {
    return;
  }
  window.addEventListener('storage', handleStorageChange);
  storageListenerAttached = true;
}

function subscribe(listener: () => void): () => void {
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDevToolingVisible(): boolean {
  return visibleSnapshot;
}

export function setDevToolingVisible(visible: boolean): void {
  writeStoredVisibility(visible);
  visibleSnapshot = readStoredVisibility();
  emitVisibilityChange();
}

export function useDevToolingVisible(): boolean {
  return useSyncExternalStore(subscribe, getDevToolingVisible, () => DEFAULT_VISIBLE);
}
