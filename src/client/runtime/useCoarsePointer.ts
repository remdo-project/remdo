import { useSyncExternalStore } from 'react';

// A touch device: its primary pointer is coarse and cannot hover. This is the
// presence signal for the mobile action toolbar (docs/outliner/mobile-toolbar.md),
// independent of viewport width.
const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

function subscribe(onStoreChange: () => void) {
  const query = globalThis.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  return globalThis.matchMedia(COARSE_POINTER_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
