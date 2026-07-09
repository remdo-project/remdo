import { Group } from '@mantine/core';
import { Suspense, lazy } from 'react';

// Dev-toolbar seam. In the production build `import.meta.env.DEV` is statically
// false, so the branch is dead and the lazy import is never referenced — the
// dev toolbar links leave the prod bundle. In dev/test they load lazily. The
// seam owns the whole condition, so callers render it unconditionally.
// See docs/dev/dev-tooling.md.

const LazyDevToolbarLinks = import.meta.env.DEV
  ? lazy(() => import('./DevToolbar').then((m) => ({ default: m.DevToolbarLinks })))
  : null;

// Bare links — for a caller that already provides the surrounding header group.
export function DevToolbarLinksSeam() {
  if (!LazyDevToolbarLinks) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevToolbarLinks />
    </Suspense>
  );
}

// Links in their own header group — for a caller with no other links, so the
// whole group (not just its contents) is absent in production.
export function DevToolbarSeam() {
  if (!LazyDevToolbarLinks) {
    return null;
  }
  return (
    <Group gap="md" className="app-header-links">
      <DevToolbarLinksSeam />
    </Group>
  );
}
