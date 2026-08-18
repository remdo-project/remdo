import path from 'node:path';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { editorModuleBoundariesRule } from '../../config/eslint/editorModuleBoundaries';

// Covers how the rule resolves specifiers, not which edges `ALLOWED` currently
// lists — that table changes as modules move. Each case names a form of import
// rather than a boundary decision.
const ruleTester = new RuleTester();

const EDITOR = path.resolve('src/client/editor');

// Governed by `outline`, which may not import `features`, and carries no
// exception entry.
const OUTLINE_FILE = path.join(EDITOR, 'outline/note-range.ts');

const FORBIDDEN = '#client/editor/features/zoom/zoom-caret';

describe('remdo/editor-module-boundaries', () => {
  it('resolves every import form and keeps exceptions scoped and current', () => {
    ruleTester.run('editor-module-boundaries', editorModuleBoundariesRule, {
      valid: [
        {
          name: 'a specifier that resolves outside the editor is not an edge',
          filename: OUTLINE_FILE,
          code: `import { $getRoot } from 'lexical';`,
        },
        {
          name: 'a file outside the editor is not governed',
          filename: path.resolve('src/client/app/router.tsx'),
          code: `import { x } from '${FORBIDDEN}';`,
        },
        {
          name: 'a directory listed as ungoverned is exempt',
          filename: path.join(EDITOR, 'dev/VanillaLexicalEditor.tsx'),
          code: `import { x } from '${FORBIDDEN}';`,
        },
      ],
      invalid: [
        {
          // The form `no-restricted-imports` cannot see, and the reason this
          // rule resolves specifiers instead of pattern-matching them.
          name: 'a relative specifier is resolved to its bucket',
          filename: OUTLINE_FILE,
          code: `import { x } from '../features/zoom/zoom-caret';`,
          errors: [{ messageId: 'forbidden' }],
        },
        {
          // A directory barrel specifier has no slash, so it must resolve to
          // that directory rather than read as a loose root module — otherwise
          // every barrel bypasses its own boundary.
          name: 'a directory barrel resolves to its directory, not the root bucket',
          filename: OUTLINE_FILE,
          code: `import { x } from '#client/editor/note-sdk-adapters';`,
          errors: [{ messageId: 'forbidden' }],
        },
        {
          name: 're-export crosses a boundary like an import',
          filename: OUTLINE_FILE,
          code: `export { x } from '${FORBIDDEN}';`,
          errors: [{ messageId: 'forbidden' }],
        },
        {
          name: 'star re-export crosses a boundary like an import',
          filename: OUTLINE_FILE,
          code: `export * from '${FORBIDDEN}';`,
          errors: [{ messageId: 'forbidden' }],
        },
        {
          name: 'a literal dynamic import crosses a boundary like an import',
          filename: OUTLINE_FILE,
          code: `export const load = () => import('${FORBIDDEN}');`,
          errors: [{ messageId: 'forbidden' }],
        },
        {
          // Fails closed: a directory nobody placed in the graph would
          // otherwise import anything unchecked.
          name: 'an editor directory absent from the graph is reported',
          filename: path.join(EDITOR, 'zz-unconfigured/module.ts'),
          code: `import { x } from '${FORBIDDEN}';`,
          errors: [{ messageId: 'unconfiguredBucket' }],
        },
      ],
    });
  });

});
