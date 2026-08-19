// Element and policy configuration for `eslint-plugin-boundaries`.
//
// `boundariesInclude` scopes classification to the editor, so everything
// outside it is *ignored* rather than *unknown* and `no-unknown-dependencies`
// reports only what the resolver genuinely cannot place.
const EDITOR = 'src/client/editor';

export const boundariesInclude = [`${EDITOR}/**`];

// Stylesheets are imported for their side effect and are not modules.
export const boundariesIgnore = ['**/*.css'];

// Folder patterns, subfolders first: `stopMatching` takes the first hit, so
// `${EDITOR}` last classifies the files sitting directly in it.
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

const ALLOWED: Record<string, readonly string[]> = {
  outline: ['editor-root', 'runtime'],
  runtime: ['editor-root', 'outline', 'features'],
  links: ['outline', 'runtime'],
  search: ['outline'],
  triggers: ['outline', 'runtime'],
  view: ['outline', 'search'],
  features: ['editor-root', 'outline', 'runtime', 'triggers', 'view'],
  plugins: ['editor-root', 'features', 'links', 'adapters', 'outline', 'runtime', 'triggers', 'view'],
  'editor-root': ['features', 'outline', 'plugins', 'runtime'],
  adapters: ['outline', 'runtime', 'features'],
};

export const boundariesPolicies = [
  ...Object.entries(ALLOWED).map(([from, to]) => ({
    from: { element: { type: from } },
    allow: { to: { element: { type: [from, ...to] } } },
  })),
  // Dev tooling reaches production modules by design and has its own seam;
  // ambient declarations are not runtime modules.
  {
    from: { element: { type: ['editor-dev', 'editor-types'] } },
    allow: { to: { element: { type: '*' } } },
  },
];
