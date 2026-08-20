import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  globalThis.addEventListener('online', onStoreChange);
  globalThis.addEventListener('offline', onStoreChange);
  return () => {
    globalThis.removeEventListener('online', onStoreChange);
    globalThis.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot(): boolean {
  return globalThis.navigator.onLine;
}

export function useOnlineState(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
