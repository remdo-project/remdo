import { Group } from '@mantine/core';
import { Suspense, lazy } from 'react';

// Dev-toolbar seam. In the production build `import.meta.env.DEV` is statically
// false, so the branch is dead and the lazy import is never referenced — the
// dev toolbar and its dev-route links leave the prod bundle. In dev/test the
// real toolbar links load lazily. See docs/dev/dev-tooling.md.

const LazyDevToolbarLinks = import.meta.env.DEV
  ? lazy(() => import('./DevToolbar').then((m) => ({ default: m.DevToolbarLinks })))
  : null;

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

export function DevToolbarSlot() {
  if (!LazyDevToolbarLinks) {
    return null;
  }
  return (
    <Group gap="md" className="app-header-links">
      <DevToolbarLinksSlot />
    </Group>
  );
}
