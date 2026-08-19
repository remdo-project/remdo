// Enforces which parts of the editor may import which, one import at a time.
// It reasons about folders, not files, so a mutual edge here can still be an
// acyclic chain — `pnpm run lint:deps` owns cycles.
const EDITOR = 'src/client/editor';

// Limits classification to the editor. Without it every import reaching outside
// counts as unknown, and `no-unknown-dependencies` reports the legal ones too.
export const boundariesInclude = [`${EDITOR}/**`];

// Imported for their side effect; there is no module to place in a bucket.
export const boundariesIgnore = ['**/*.css'];

// Maps each editor file to the bucket that owns it.
// The last entry matches the whole editor
export const boundariesElements = [
  { type: 'editing-insertion', pattern: `${EDITOR}/editing/insertion`, stopMatching: true },
  { type: 'editing-deletion', pattern: `${EDITOR}/editing/deletion`, stopMatching: true },
  { type: 'editing-indentation', pattern: `${EDITOR}/editing/indentation`, stopMatching: true },
  { type: 'editing-reordering', pattern: `${EDITOR}/editing/reordering`, stopMatching: true },
  { type: 'editing-clipboard', pattern: `${EDITOR}/editing/clipboard`, stopMatching: true },
  { type: 'outline', pattern: `${EDITOR}/outline`, stopMatching: true },
  { type: 'runtime', pattern: `${EDITOR}/runtime`, stopMatching: true },
  { type: 'features', pattern: `${EDITOR}/features`, stopMatching: true },
  { type: 'plugins', pattern: `${EDITOR}/plugins`, stopMatching: true },
  { type: 'triggers', pattern: `${EDITOR}/triggers`, stopMatching: true },
  { type: 'view', pattern: `${EDITOR}/view`, stopMatching: true },
  { type: 'adapters', pattern: `${EDITOR}/note-sdk-adapters`, stopMatching: true },
  { type: 'editor-dev', pattern: `${EDITOR}/dev`, stopMatching: true },
  { type: 'editor-types', pattern: `${EDITOR}/types`, stopMatching: true },
  { type: 'editor-root', pattern: EDITOR, stopMatching: true },
] as const;

// Each bucket, and the buckets it may import from. Anything unlisted is refused.
export const boundariesPolicies = [
  // One owner per operation: they share a namespace, not an implementation.
  { from: { element: { type: ['editing-insertion', 'editing-indentation', 'editing-reordering'] } },
    allow: { to: { element: { type: ['editor-root', 'outline'] } } } },
  { from: { element: { type: 'editing-deletion' } },
    allow: { to: { element: { type: ['editor-root', 'outline', 'features'] } } } },
  { from: { element: { type: 'editing-clipboard' } },
    allow: { to: { element: { type: ['editor-root', 'outline', 'features', 'runtime'] } } } },

  { from: { element: { type: 'outline' } },
    allow: { to: { element: { type: ['editor-root', 'runtime'] } } } },
  { from: { element: { type: 'runtime' } },
    allow: { to: { element: { type: ['editor-root', 'outline', 'features'] } } } },
  { from: { element: { type: 'triggers' } },
    allow: { to: { element: { type: ['outline', 'runtime'] } } } },
  { from: { element: { type: 'view' } },
    allow: { to: { element: { type: ['outline', 'features'] } } } },
  { from: { element: { type: 'features' } },
    allow: { to: { element: { type: ['editor-root', 'outline', 'runtime', 'triggers', 'view', 'adapters'] } } } },
  { from: { element: { type: 'plugins' } },
    allow: { to: { element: { type: ['editor-root', 'features', 'adapters', 'outline', 'runtime', 'triggers', 'view'] } } } },
  { from: { element: { type: 'editor-root' } },
    allow: { to: { element: { type: ['features', 'plugins', 'runtime', 'editing-insertion', 'editing-deletion', 'editing-indentation', 'editing-reordering', 'editing-clipboard'] } } } },
  { from: { element: { type: 'adapters' } },
    allow: { to: { element: { type: ['outline', 'runtime', 'features'] } } } },

  // Dev tooling reaches production modules by design; ambient declarations are
  // not runtime modules. Neither belongs in the graph.
  { from: { element: { type: ['editor-dev', 'editor-types'] } },
    allow: { to: { element: { type: '*' } } } },
];
