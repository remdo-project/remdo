// Coarse owners for `src/`. Editor internals stay on `editorBoundaries.ts`;
// this graph treats the editor as one owner so it does not freeze that grain.
// It reasons about folders, not files, so a mutual edge here can still be an
// acyclic chain — `pnpm run lint:deps` owns cycles.
const SRC = 'src';
const CLIENT = `${SRC}/client`;

export const srcBoundariesInclude = [`${SRC}/**`];

export const srcBoundariesIgnore = ['**/*.css'];

export const srcBoundariesElements = [
  { type: 'client-app', pattern: `${CLIENT}/app`, stopMatching: true },
  { type: 'client-editor', pattern: `${CLIENT}/editor`, stopMatching: true },
  { type: 'client-ui', pattern: `${CLIENT}/ui`, stopMatching: true },
  { type: 'client-runtime', pattern: `${CLIENT}/runtime`, stopMatching: true },
  { type: 'client-search', pattern: `${CLIENT}/search`, stopMatching: true },
  { type: 'client-dev', pattern: `${CLIENT}/dev`, stopMatching: true },
  { type: 'server', pattern: `${SRC}/server`, stopMatching: true },
  { type: 'domain', pattern: `${SRC}/domain`, stopMatching: true },
  { type: 'note-sdk', pattern: `${SRC}/note-sdk`, stopMatching: true },
  { type: 'collaboration', pattern: `${SRC}/collaboration`, stopMatching: true },
  { type: 'platform', pattern: `${SRC}/platform`, stopMatching: true },
  { type: 'projection', pattern: `${SRC}/projection`, stopMatching: true },
  { type: 'headless', pattern: `${SRC}/headless`, stopMatching: true },
  { type: 'document-routes', pattern: `${SRC}/document-routes`, stopMatching: true },
  { type: 'unowned', pattern: SRC, stopMatching: true },
] as const;

const CLIENT_SHARED = ['client-ui', 'client-runtime', 'client-search'] as const;

export const srcBoundariesPolicies = [
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

  // AppHeader imports the dev-toolbar seam until the shell composes that link.
  // srcBoundaries.spec.ts owns the file-level ratchet.
  { from: { element: { type: 'client-ui' } },
    allow: { to: { element: { type: ['client-ui', 'client-app'] } } } },

  { from: { element: { type: 'client-runtime' } },
    allow: { to: { element: { type: ['client-runtime'] } } } },
  { from: { element: { type: 'client-search' } },
    allow: { to: { element: { type: ['client-search'] } } } },
  { from: { element: { type: 'client-dev' } },
    allow: { to: { element: { type: ['client-dev', ...CLIENT_SHARED] } } } },

  { from: { element: { type: 'client-editor' } },
    allow: { to: { element: { type: [
      'client-editor',
      ...CLIENT_SHARED,
      'domain',
      'note-sdk',
      'document-routes',
      'collaboration',
      'platform',
    ] } } } },

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

  // Headless collab is a composition owner: it binds collaboration, the editor
  // initial config, and the server token manager in one process.
  { from: { element: { type: 'headless' } },
    allow: { to: { element: { type: [
      'headless',
      'collaboration',
      'client-editor',
      'platform',
      'server',
    ] } } } },
];
