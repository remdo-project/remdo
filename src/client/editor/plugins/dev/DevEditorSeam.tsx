import { Suspense, lazy } from 'react';

// Dev editor seam. In the production build `import.meta.env.DEV` is statically
// false, so the branch is dead and the lazy import is never referenced — the
// dev editor plugins (tree view, test bridge, schema validation) leave the prod
// bundle. In dev/test they load lazily inside the editor's Lexical context.
// See docs/dev/dev-tooling.md.

const LazyDevPlugin = import.meta.env.DEV
  ? lazy(() => import('./DevPlugin').then((m) => ({ default: m.DevPlugin })))
  : null;

export function DevEditorSeam() {
  if (!LazyDevPlugin) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDevPlugin />
    </Suspense>
  );
}
