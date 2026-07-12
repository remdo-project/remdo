import { useSyncExternalStore } from 'react';

// The height, in CSS pixels, currently obscured at the bottom of the layout
// viewport by the on-screen keyboard (or other visual-viewport shrink). Used to
// lift the mobile action toolbar so it docks directly above the keyboard rather
// than sitting behind it — `position: fixed` alone anchors to the layout
// viewport, which the keyboard does not shrink.
function readInset(): number {
  const viewport = globalThis.visualViewport;
  if (!viewport) {
    return 0;
  }
  // The keyboard shrinks the visual viewport below the layout viewport height;
  // absent that shrink there is no keyboard and no inset. Only when shrunk do we
  // also subtract offsetTop (the viewport pan the keyboard introduces), so plain
  // outline scrolling — which changes offsetTop but not height — never lifts the
  // toolbar.
  const shrink = globalThis.innerHeight - viewport.height;
  if (shrink <= 0) {
    return 0;
  }
  const obscured = shrink - viewport.offsetTop;
  return obscured > 0 ? obscured : 0;
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

export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, readInset, () => 0);
}
