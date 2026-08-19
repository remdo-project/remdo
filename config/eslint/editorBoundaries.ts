// Element and policy configuration for `eslint-plugin-boundaries`.
const EDITOR = 'src/client/editor';

// Limits classification to the editor. Without it every import reaching outside
// counts as unknown, and `no-unknown-dependencies` reports the legal ones too.
export const boundariesInclude = [`${EDITOR}/**`];

// Imported for their side effect; there is no module to place in a bucket.
export const boundariesIgnore = ['**/*.css'];

// Maps each editor file to the bucket that owns it.
// The last entry matches the whole editor
export const boundariesElements = [
  { type: 'outline', pattern: `${EDITOR}/outline`, stopMatching: true },
  { type: 'runtime', pattern: `${EDITOR}/runtime`, stopMatching: true },
  { type: 'features', pattern: `${EDITOR}/features`, stopMatching: true },
  { type: 'plugins', pattern: `${EDITOR}/plugins`, stopMatching: true },
  { type: 'links', pattern: `${EDITOR}/links`, stopMatching: true },
  { type: 'search', pattern: `${EDITOR}/search`, stopMatching: true },
  { type: 'triggers', pattern: `${EDITOR}/triggers`, stopMatching: true },
  { type: 'view', pattern: `${EDITOR}/view`, stopMatching: true },
  { type: 'adapters', pattern: `${EDITOR}/note-sdk-adapters`, stopMatching: true },
  { type: 'editor-dev', pattern: `${EDITOR}/dev`, stopMatching: true },
  { type: 'editor-types', pattern: `${EDITOR}/types`, stopMatching: true },
  { type: 'editor-root', pattern: EDITOR, stopMatching: true },
] as const;

// Each bucket, and the buckets it may import from. Anything unlisted is refused.
export const boundariesPolicies = [
  { from: { element: { type: 'outline' } },
    allow: { to: { element: { type: ['editor-root', 'runtime'] } } } },
  { from: { element: { type: 'runtime' } },
    allow: { to: { element: { type: ['editor-root', 'outline', 'features'] } } } },
  { from: { element: { type: 'links' } },
    allow: { to: { element: { type: ['outline', 'runtime'] } } } },
  { from: { element: { type: 'search' } },
    allow: { to: { element: { type: ['outline'] } } } },
  { from: { element: { type: 'triggers' } },
    allow: { to: { element: { type: ['outline', 'runtime'] } } } },
  { from: { element: { type: 'view' } },
    allow: { to: { element: { type: ['outline', 'search'] } } } },
  { from: { element: { type: 'features' } },
    allow: { to: { element: { type: ['editor-root', 'outline', 'runtime', 'triggers', 'view'] } } } },
  { from: { element: { type: 'plugins' } },
    allow: { to: { element: { type: ['editor-root', 'features', 'links', 'adapters', 'outline', 'runtime', 'triggers', 'view'] } } } },
  { from: { element: { type: 'editor-root' } },
    allow: { to: { element: { type: ['features', 'outline', 'plugins', 'runtime'] } } } },
  { from: { element: { type: 'adapters' } },
    allow: { to: { element: { type: ['outline', 'runtime', 'features'] } } } },

  // Dev tooling reaches production modules by design; ambient declarations are
  // not runtime modules. Neither belongs in the graph.
  { from: { element: { type: ['editor-dev', 'editor-types'] } },
    allow: { to: { element: { type: '*' } } } },
];
