import { useSyncExternalStore } from 'react';

// The lower edge of the currently visible viewport in layout-viewport
// coordinates. iOS keeps fixed-position elements tied to the layout viewport
// while its keyboard covers part of that viewport, so the mobile toolbar uses
// this edge directly instead of deriving a keyboard inset from innerHeight.
function readBottom(): number | null {
  const viewport = globalThis.visualViewport;
  return viewport ? viewport.offsetTop + viewport.height : null;
}

function subscribe(onStoreChange: () => void) {
  const viewport = globalThis.visualViewport;
  if (!viewport) {
    return () => {};
  }
  viewport.addEventListener('resize', onStoreChange);
  viewport.addEventListener('scroll', onStoreChange);
  return () => {
    viewport.removeEventListener('resize', onStoreChange);
    viewport.removeEventListener('scroll', onStoreChange);
  };
}

export function useVisualViewportBottom(): number | null {
  return useSyncExternalStore(subscribe, readBottom, () => null);
}
