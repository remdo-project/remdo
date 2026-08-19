// Element and policy configuration for `eslint-plugin-boundaries`, running
// alongside `remdo/editor-module-boundaries` on the same graph so the two can be
// compared before the custom rule retires.
//
// Elements must cover everything an editor file can reach. An undeclared target
// is "unknown", and `no-unknown-dependencies` reports it — accurate, but noise
// unless the non-editor surface is declared too.
const EDITOR = 'src/client/editor';

export const boundariesElements = [
  // Editor buckets, most specific first: `outline/selection` before `outline`.
  { type: 'selection', pattern: `${EDITOR}/outline/selection/**`, mode: 'full' },
  { type: 'outline', pattern: `${EDITOR}/outline/**`, mode: 'full' },
  { type: 'runtime', pattern: `${EDITOR}/runtime/**`, mode: 'full' },
  { type: 'features', pattern: `${EDITOR}/features/**`, mode: 'full' },
  { type: 'plugins', pattern: `${EDITOR}/plugins/**`, mode: 'full' },
  { type: 'links', pattern: `${EDITOR}/links/**`, mode: 'full' },
  { type: 'search', pattern: `${EDITOR}/search/**`, mode: 'full' },
  { type: 'triggers', pattern: `${EDITOR}/triggers/**`, mode: 'full' },
  { type: 'view', pattern: `${EDITOR}/view/**`, mode: 'full' },
  { type: 'adapters', pattern: `${EDITOR}/note-sdk-adapters/**`, mode: 'full' },
  { type: 'editor-dev', pattern: `${EDITOR}/dev/**`, mode: 'full' },
  { type: 'editor-types', pattern: `${EDITOR}/types/**`, mode: 'full' },
  { type: 'editor-root', pattern: `${EDITOR}/*.{ts,tsx}`, mode: 'full' },

  // Everything outside the editor. Declared so `no-unknown-dependencies`
  // reports genuinely unresolvable imports rather than every legal one.
  // Stylesheets are imported for their side effect and are not modules.
  { type: 'styles', pattern: 'src/**/*.css', mode: 'full' },

  { type: 'outside', pattern: 'src/!(client)/**', mode: 'full' },
  { type: 'outside', pattern: 'src/client/!(editor)/**', mode: 'full' },
  { type: 'outside', pattern: 'tests/**', mode: 'full' },
  { type: 'outside', pattern: 'config/**', mode: 'full' },
  { type: 'outside', pattern: 'tools/**', mode: 'full' },
] as const;

// Mirrors ALLOWED in editorModuleBoundaries.ts. `outline/selection` is a
// separate element here because the pattern needs it, but it shares outline's
// edges, and both may reach `outside` for domain and platform helpers.
const ALLOWED: Record<string, readonly string[]> = {
  outline: ['editor-root', 'runtime', 'features', 'selection'],
  selection: ['editor-root', 'runtime', 'features', 'outline'],
  runtime: ['editor-root', 'outline', 'selection', 'features'],
  links: ['outline', 'selection', 'runtime'],
  search: ['outline', 'selection'],
  triggers: ['outline', 'selection', 'runtime'],
  view: ['outline', 'selection', 'search'],
  features: ['editor-root', 'outline', 'selection', 'runtime', 'triggers', 'view'],
  plugins: ['editor-root', 'features', 'links', 'adapters', 'outline', 'selection', 'runtime', 'triggers', 'view'],
  'editor-root': ['features', 'outline', 'selection', 'plugins', 'runtime'],
  adapters: ['outline', 'selection', 'runtime', 'features'],
};

export const boundariesPolicies = Object.entries(ALLOWED).map(([from, to]) => ({
  from: [{ element: { type: from } }],
  allow: [from, 'outside', 'styles', ...to].map((type) => ({ to: { element: { type } } })),
}));

// Dev tooling reaches production modules by design and has its own seam;
// ambient declarations are not runtime modules.
export const boundariesUngoverned = [
  { from: [{ element: { type: 'editor-dev' } }, { element: { type: 'editor-types' } }],
    allow: boundariesElements.map((e) => ({ to: { element: { type: e.type } } })) },
];
