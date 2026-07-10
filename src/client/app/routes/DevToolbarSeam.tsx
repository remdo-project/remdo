import { Suspense, lazy } from 'react';

// Dev-toolbar seam: the production-side entry that reaches the dev toolbar. In
// the production build `import.meta.env.DEV` is statically false, so the branch
// is dead and the lazy import into dev/ is never referenced — the dev toolbar
// links leave the prod bundle. In dev/test they load lazily. The seam owns the
// whole condition, so callers render it unconditionally.
// See docs/dev/dev-tooling.md.

const LazyDevToolbarLinks = import.meta.env.DEV
  ? lazy(() => import('./dev/DevToolbar').then((m) => ({ default: m.DevToolbarLinks })))
  : null;

// Bare links — for a caller that already provides the surrounding header group.
export function DevToolbarLinksSeam({ linkClassName }: { linkClassName?: string }) {
  if (!LazyDevToolbarLinks) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevToolbarLinks linkClassName={linkClassName} />
    </Suspense>
  );
}
