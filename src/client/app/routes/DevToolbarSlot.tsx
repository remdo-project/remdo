import { Suspense, lazy } from 'react';

// Dev-toolbar seam. In the production build `import.meta.env.DEV` is statically
// false, so the branch is dead and the lazy import is never referenced — the
// dev toolbar and its dev-route links leave the prod bundle. In dev/test the
// real toolbar is loaded lazily. See docs/dev/dev-tooling.md.

const LazyDevToolbar = import.meta.env.DEV
  ? lazy(() => import('./DevToolbar').then((m) => ({ default: m.DevToolbar })))
  : null;

const LazyDevToolbarLinks = import.meta.env.DEV
  ? lazy(() => import('./DevToolbar').then((m) => ({ default: m.DevToolbarLinks })))
  : null;

export function DevToolbarSlot() {
  if (!LazyDevToolbar) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevToolbar />
    </Suspense>
  );
}

export function DevToolbarLinksSlot() {
  if (!LazyDevToolbarLinks) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevToolbarLinks />
    </Suspense>
  );
}
