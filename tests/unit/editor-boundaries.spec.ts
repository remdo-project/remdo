import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundariesElements } from '../../config/eslint/editorBoundaries';

const EDITOR = path.resolve('src/client/editor');

describe('editor boundaries', () => {
  // An unlisted directory falls through to the `editor-root` catch-all and
  // inherits its allowances, so it raises no lint error however it imports.
  // Failing here is what prompts placing a new directory in the graph.
  it('lists every directory under the editor', () => {
    const declared = new Set(
      boundariesElements
        .map((element) => path.relative(EDITOR, path.resolve(element.pattern)))
        .filter((relative) => relative.length > 0)
    );

    const present = fs
      .readdirSync(EDITOR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(present.filter((name) => !declared.has(name))).toEqual([]);
  });
});
