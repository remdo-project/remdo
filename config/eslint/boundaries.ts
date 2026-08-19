// Owner graphs for eslint-plugin-boundaries. Two graphs, one module: the
// editor keeps its capability grain, and src/ is classified only as coarse
// owners so that grain stays unfrozen. Each graph reasons about folders, not
// files, so a mutual edge can still be an acyclic chain — `pnpm run lint:deps`
// owns cycles.
const SRC = 'src';
const CLIENT = `${SRC}/client`;
const EDITOR = `${CLIENT}/editor`;

const cssIgnore = ['**/*.css'] as const;

const element = (type: string, pattern: string) =>
  ({ type, pattern, stopMatching: true }) as const;

export const editorBoundaries = {
  // Limits classification to the editor. Without it every import reaching
  // outside counts as unknown, and `no-unknown-dependencies` reports the
  // legal ones too.
  include: [`${EDITOR}/**`],
  ignore: cssIgnore,
  // Maps each editor file to its owner. The editor holds no loose files, so
  // the last entry claims nothing today; it is what a new one would fall into,
  // and no policy grants it anything.
  elements: [
    element('editing-insertion', `${EDITOR}/editing/insertion`),
    element('editing-deletion', `${EDITOR}/editing/deletion`),
    element('editing-indentation', `${EDITOR}/editing/indentation`),
    element('editing-reordering', `${EDITOR}/editing/reordering`),
    element('editing-clipboard', `${EDITOR}/editing/clipboard`),
    element('selection', `${EDITOR}/selection`),
    element('outline', `${EDITOR}/outline`),
    element('runtime', `${EDITOR}/runtime`),
    element('features', `${EDITOR}/features`),
    element('keymap', `${EDITOR}/keymap`),
    element('mobile-toolbar', `${EDITOR}/mobile-toolbar`),
    element('triggers', `${EDITOR}/triggers`),
    element('view', `${EDITOR}/view`),
    element('adapters', `${EDITOR}/note-sdk-adapters`),
    element('editor-dev', `${EDITOR}/dev`),
    element('editor-types', `${EDITOR}/types`),
    element('foundation', `${EDITOR}/foundation`),
    element('shell', `${EDITOR}/shell`),
    element('unowned', EDITOR),
  ],
  policies: [
    // One owner per operation: they share a namespace, not an implementation.
    { from: { element: { type: ['editing-insertion', 'editing-indentation', 'editing-reordering'] } },
      allow: { to: { element: { type: ['foundation', 'outline'] } } } },
    { from: { element: { type: 'editing-deletion' } },
      allow: { to: { element: { type: ['foundation', 'outline', 'features'] } } } },
    { from: { element: { type: 'editing-clipboard' } },
      allow: { to: { element: { type: ['foundation', 'outline', 'features', 'runtime'] } } } },

    { from: { element: { type: 'selection' } },
      allow: { to: { element: { type: ['foundation', 'outline'] } } } },

    { from: { element: { type: 'outline' } },
      allow: { to: { element: { type: ['foundation', 'runtime'] } } } },
    { from: { element: { type: 'runtime' } },
      allow: { to: { element: { type: ['foundation', 'outline', 'features'] } } } },
    { from: { element: { type: 'keymap' } },
      allow: { to: { element: { type: ['foundation'] } } } },
    { from: { element: { type: 'mobile-toolbar' } },
      allow: { to: { element: { type: ['foundation', 'outline'] } } } },
    { from: { element: { type: 'triggers' } },
      allow: { to: { element: { type: ['outline', 'runtime'] } } } },
    { from: { element: { type: 'view' } },
      allow: { to: { element: { type: ['outline', 'features'] } } } },
    { from: { element: { type: 'features' } },
      allow: { to: { element: { type: ['foundation', 'outline', 'runtime', 'triggers', 'view', 'adapters'] } } } },
    // The shell composes, so it reaches everything it mounts. Its edge into
    // editor-dev exists only for DevEditorSeam's lazy import, which is what
    // keeps dev tooling out of the production bundle; check-dev-boundary
    // proves it does.
    { from: { element: { type: 'shell' } },
      allow: { to: { element: { type: ['foundation', 'features', 'runtime', 'selection', 'keymap', 'mobile-toolbar', 'editor-dev', 'editing-insertion', 'editing-deletion', 'editing-indentation', 'editing-reordering', 'editing-clipboard'] } } } },
    { from: { element: { type: 'adapters' } },
      allow: { to: { element: { type: ['outline', 'runtime', 'features'] } } } },

    // Dev tooling reaches production modules by design; ambient declarations
    // are not runtime modules. Neither belongs in the graph.
    { from: { element: { type: ['editor-dev', 'editor-types'] } },
      allow: { to: { element: { type: '*' } } } },
  ],
} as const;

const CLIENT_SHARED = ['client-ui', 'client-runtime', 'client-search'] as const;

export const srcBoundaries = {
  include: [`${SRC}/**`],
  ignore: cssIgnore,
  elements: [
    element('client-app', `${CLIENT}/app`),
    element('client-editor', `${CLIENT}/editor`),
    element('client-ui', `${CLIENT}/ui`),
    element('client-runtime', `${CLIENT}/runtime`),
    element('client-search', `${CLIENT}/search`),
    element('client-dev', `${CLIENT}/dev`),
    element('server', `${SRC}/server`),
    element('domain', `${SRC}/domain`),
    element('note-sdk', `${SRC}/note-sdk`),
    element('collaboration', `${SRC}/collaboration`),
    element('platform', `${SRC}/platform`),
    element('projection', `${SRC}/projection`),
    element('headless', `${SRC}/headless`),
    element('document-routes', `${SRC}/document-routes`),
    element('unowned', SRC),
  ],
  policies: [
    { from: { element: { type: 'client-app' } },
      allow: { to: { element: { type: [
        'client-app',
        ...CLIENT_SHARED,
        'client-editor',
        'domain',
        'note-sdk',
        'document-routes',
        'collaboration',
        'platform',
      ] } } } },

    // AppHeader imports the dev-toolbar seam until the shell composes that
    // link. boundaries.spec.ts owns the file-level ratchet.
    { from: { element: { type: 'client-ui' } },
      allow: { to: { element: { type: ['client-ui', 'client-app'] } } } },

    { from: { element: { type: 'client-runtime' } },
      allow: { to: { element: { type: ['client-runtime'] } } } },
    { from: { element: { type: 'client-search' } },
      allow: { to: { element: { type: ['client-search'] } } } },
    { from: { element: { type: 'client-dev' } },
      allow: { to: { element: { type: ['client-dev', ...CLIENT_SHARED] } } } },

    { from: { element: { type: 'server' } },
      allow: { to: { element: { type: ['server', 'domain', 'platform', 'projection'] } } } },
    { from: { element: { type: 'domain' } },
      allow: { to: { element: { type: ['domain'] } } } },
    { from: { element: { type: 'note-sdk' } },
      allow: { to: { element: { type: ['note-sdk', 'domain'] } } } },
    { from: { element: { type: 'collaboration' } },
      allow: { to: { element: { type: ['collaboration', 'platform', 'document-routes'] } } } },
    { from: { element: { type: 'platform' } },
      allow: { to: { element: { type: ['platform'] } } } },
    { from: { element: { type: 'projection' } },
      allow: { to: { element: { type: ['projection'] } } } },
    { from: { element: { type: 'document-routes' } },
      allow: { to: { element: { type: ['document-routes', 'domain'] } } } },

    // Headless collab is a composition owner: it binds collaboration, the
    // editor initial config, and the server token manager in one process.
    { from: { element: { type: 'headless' } },
      allow: { to: { element: { type: [
        'headless',
        'collaboration',
        'client-editor',
        'platform',
        'server',
      ] } } } },
  ],
} as const;
