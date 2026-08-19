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
  // Foundations.
  outline: ['#root', 'runtime'],
  // Cycle: runtime registers and serializes the outline's node types, and
  // outline reads the per-note state runtime stores.
  runtime: ['#root', 'outline', 'features'],

  // Capabilities.
  links: ['outline', 'runtime'],
  search: ['outline'],
  triggers: ['outline', 'runtime'],
  view: ['outline', 'search'],
  features: ['#root', 'outline', 'runtime', 'triggers', 'view'],

  // Wiring. `plugins` reaches every layer because it holds capabilities, core
  // editing, and infrastructure at once — the breadth the taxonomy work narrows.
  plugins: ['#root', 'features', 'links', 'note-sdk-adapters', 'outline', 'runtime', 'triggers', 'view'],
  '#root': ['features', 'outline', 'plugins', 'runtime'],

  'note-sdk-adapters': ['outline', 'runtime', 'features'],
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
        'Editor boundary: {{from}}/ must not import {{to}}/. Allowed from {{from}}/: {{allowed}}. Move the code to the bucket that owns it, or add the edge to ALLOWED in config/eslint/editorModuleBoundaries.ts.',
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
    // Fail closed: an unlisted directory would otherwise import anything.
    if (!allowed) {
      return {
        Program(node) {
          context.report({ node, messageId: 'unconfiguredBucket', data: { bucket: from } });
        },
      };
    }

    const fromDir = path.dirname(context.physicalFilename);
    const checkSource = (node: Node, specifier: unknown): void => {
      if (typeof specifier !== 'string') return;

      const target = resolveTarget(specifier, fromDir);
      if (target === null) return;

      const to = bucketOf(target);
      if (to === from || allowed.includes(to)) return;

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
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node.source, node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source, node.source.value);
      },
      // A computed specifier is not statically resolvable and is left to review.
      ImportExpression(node) {
        if (node.source.type === 'Literal') checkSource(node.source, node.source.value);
      },
    };
  },
};
