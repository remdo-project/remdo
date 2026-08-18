import fs from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';
import type { Node } from 'estree';

// Editor-internal dependency graph. Each key is a top-level directory under
// `src/client/editor`; its value lists the directories it may import from.
// `#root` is the loose collection of modules sitting directly in
// `src/client/editor`, holding both the composition root (Editor.tsx) and leaf
// utilities (invariant.ts, lexical-helpers.ts, commands.ts).
//
// This is the graph as it stands, not the graph as it should be: it freezes
// today's edges so the taxonomy work can only narrow them. Entries are grouped
// by layer, so an edge is allowed because its bucket reaches downward.
//
// TODO: replace these buckets with owners. They are the current folders, which
// mix three axes — layer (`outline`, `runtime`), mechanism (`plugins`), and
// capability (`features`) — so a bucket name does not answer "who owns this?".
// Neither the grouping above nor any single entry is authoritative about
// intended ownership; both record where code sits today. Until then, treat a
// violation as "this edge is new", not as "this edge is wrong by design".
// Probe: the table lists owners rather than directories, and the layer comments
// above are gone.
const ALLOWED: Record<string, readonly string[]> = {
  // Foundations. The document model and the state it is stored in; imported
  // widely, importing little.
  outline: ['#root', 'runtime'],
  // Cycle: runtime sits above outline (node registration) and below it
  // (note-id and fold state).
  runtime: ['#root', 'outline'],

  // Capabilities. One concern each, built on the foundations.
  links: ['outline', 'runtime'],
  search: ['outline'],
  triggers: ['outline', 'runtime'],
  view: ['outline', 'search'],
  features: ['#root', 'outline', 'runtime', 'triggers', 'view'],

  // Wiring. Composes the above into an editor, so it reaches every layer.
  // The breadth of `plugins` is what the taxonomy work narrows: it holds
  // capabilities, core editing, and infrastructure at once.
  plugins: ['#root', 'features', 'links', 'note-sdk-adapters', 'outline', 'runtime', 'triggers', 'view'],
  '#root': ['features', 'outline', 'plugins', 'runtime'],

  // Adapter to the Note SDK, outside the editor.
  'note-sdk-adapters': ['outline', 'runtime'],
};

// Editor directories deliberately outside the graph. Listing them is what makes
// an unlisted directory an error rather than a silent gap.
const UNGOVERNED = new Set([
  // Dev tooling reaches production modules by design and has its own boundary
  // (the dev/prod seam enforced in eslint.config.mts).
  'dev',
  // Ambient module declarations, not runtime modules.
  'types',
]);

// TODO: empty this list; it exists only to admit today's boundary violations
// so the rule can be enforced before the modules move. Every entry is a
// boundary the taxonomy is meant to remove, so a non-empty list means the
// migration is unfinished. Probe: delete this constant and the `excused` branch
// in the rule below; `pnpm run lint:code` passes once no entries remain.
//
// An entry that no longer matches any import is reported as stale, so a move
// cannot land while leaving its exception behind.
// Exported so the spec can audit the inventory: an entry whose file was renamed
// or deleted is unreachable from the rule, because ESLint never visits the old
// path — and a move is the workflow this list exists to police.
export const EXCEPTIONS: readonly { from: string; to: string; file: string; why: string }[] = [
  {
    from: 'outline',
    to: 'features',
    file: 'outline/note-context.ts',
    why: 'note-body model belongs to the outline (docs/todo.md, editor module ownership)',
  },
  { from: 'outline', to: 'features', file: 'outline/schema.ts', why: 'note-body model' },
  { from: 'outline', to: 'features', file: 'outline/list-structure.ts', why: 'note-body model' },
  { from: 'outline', to: 'features', file: 'outline/selection/tree.ts', why: 'note-body model' },
  { from: 'outline', to: 'features', file: 'outline/selection/resolve.ts', why: 'note-body model' },
  { from: 'outline', to: 'features', file: 'outline/selection/heads.ts', why: 'note-body model' },
  { from: 'outline', to: 'features', file: 'outline/selection/structural-range.ts', why: 'note-body model' },
  { from: 'outline', to: 'features', file: 'outline/selection/snapshot.ts', why: 'note-body model' },
  {
    from: 'outline',
    to: 'plugins',
    file: 'outline/selection/delete-selection.ts',
    why: 'plugins/selected-note-range.ts belongs under outline/selection',
  },
  { from: 'runtime', to: 'features', file: 'runtime/nodes.ts', why: 'node registration; see node-ownership question' },
  { from: 'runtime', to: 'features', file: 'runtime/serialized-note-types.ts', why: 'note-body model' },
  { from: 'note-sdk-adapters', to: 'features', file: 'note-sdk-adapters/lexical.ts', why: 'note-body model + zoom view root' },
  { from: 'features', to: 'plugins', file: 'features/zoom/ZoomPlugin.tsx', why: 'collaboration provider is not a plugin concern' },
];

const EDITOR_ROOT = path.normalize('src/client/editor');
const EDITOR_ROOT_ABS = path.resolve(EDITOR_ROOT);
const ALIAS_PREFIX = '#client/editor/';

// Cached: `bucketOf` asks this for every barrel specifier, and the set of
// top-level directories does not change during a lint run. A watch-mode process
// outlives that assumption, so a directory added mid-session is only recognized
// after the watcher restarts.
const directoryCache = new Map<string, boolean>();

function isDirectory(candidate: string): boolean {
  const cached = directoryCache.get(candidate);
  if (cached !== undefined) return cached;
  const result = fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
  directoryCache.set(candidate, result);
  return result;
}

function toEditorRelative(filename: string): string | null {
  const normalized = path.normalize(filename);
  const index = normalized.lastIndexOf(EDITOR_ROOT + path.sep);
  if (index === -1) return null;
  return normalized.slice(index + EDITOR_ROOT.length + 1).split(path.sep).join('/');
}

// The top-level bucket a path belongs to: its first segment, or `#root` for a
// module sitting directly in src/client/editor.
//
// A specifier naming a directory barrel (`#client/editor/note-sdk-adapters`)
// has no slash, so it must be recognized as that directory rather than read as
// a loose `#root` module — otherwise every barrel silently bypasses its own
// boundary.
function bucketOf(editorRelative: string): string {
  const segments = editorRelative.split('/');
  if (segments.length > 1) return segments[0]!;
  return isDirectory(path.join(EDITOR_ROOT_ABS, editorRelative)) ? editorRelative : '#root';
}

function resolveTarget(specifier: string, fromDir: string): string | null {
  if (specifier.startsWith(ALIAS_PREFIX)) {
    return specifier.slice(ALIAS_PREFIX.length);
  }
  if (!specifier.startsWith('.')) return null;
  const resolved = path.normalize(path.join(fromDir, specifier));
  return toEditorRelative(resolved);
}

export const editorModuleBoundariesRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce the dependency graph between top-level directories under src/client/editor.',
    },
    schema: [],
    messages: {
      forbidden:
        'Editor boundary: {{from}}/ must not import {{to}}/. Allowed from {{from}}/: {{allowed}}. If this edge is intended, add it to ALLOWED in config/eslint/editorModuleBoundaries.ts; if it is debt, add an EXCEPTIONS entry naming the work that removes it.',
      staleException:
        'Stale EXCEPTIONS entry in config/eslint/editorModuleBoundaries.ts: {{file}} no longer imports {{to}}/. Delete the entry.',
      unconfiguredBucket:
        'Editor directory {{bucket}}/ has no ALLOWED entry, so its imports are unchecked. Add it to ALLOWED in config/eslint/editorModuleBoundaries.ts with the buckets it may import, or to UNGOVERNED if it is deliberately outside the graph.',
    },
  },
  create(context) {
    const editorRelative = toEditorRelative(context.physicalFilename);
    if (editorRelative === null) return {};

    const from = bucketOf(editorRelative);
    if (UNGOVERNED.has(from)) return {};

    const allowed = ALLOWED[from];
    // Fail closed: a bucket with no entry is an editor directory nobody has
    // placed in the graph, so it would otherwise import anything unchecked.
    if (!allowed) {
      return {
        Program(node) {
          context.report({ node, messageId: 'unconfiguredBucket', data: { bucket: from } });
        },
      };
    }

    const fromDir = path.dirname(context.physicalFilename);
    const fileExceptions = EXCEPTIONS.filter((entry) => entry.file === editorRelative);
    const usedExceptions = new Set<string>();

    const checkSource = (node: Node, specifier: unknown): void => {
      if (typeof specifier !== 'string') return;

      const target = resolveTarget(specifier, fromDir);
      if (target === null) return;

      const to = bucketOf(target);
      if (to === from || allowed.includes(to)) return;

      const excused = fileExceptions.some((entry) => entry.from === from && entry.to === to);
      if (excused) {
        usedExceptions.add(to);
        return;
      }

      context.report({
        node,
        messageId: 'forbidden',
        data: { from, to, allowed: allowed.join(', ') },
      });
    };

    return {
      ImportDeclaration(node) {
        checkSource(node.source, node.source.value);
      },
      // `export ... from` and `export * from` re-export across the boundary just
      // as an import does.
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node.source, node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source, node.source.value);
      },
      // Dynamic `import('...')` with a literal specifier; a computed specifier
      // is not statically resolvable and is left to review.
      ImportExpression(node) {
        if (node.source.type === 'Literal') checkSource(node.source, node.source.value);
      },
      'Program:exit': function reportStale(program) {
        for (const entry of fileExceptions) {
          if (usedExceptions.has(entry.to)) continue;
          context.report({
            node: program,
            messageId: 'staleException',
            data: { file: entry.file, to: entry.to },
          });
        }
      },
    };
  },
};
