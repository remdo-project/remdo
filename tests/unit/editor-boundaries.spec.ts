import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundariesElements } from '../../config/eslint/editorBoundaries';

const EDITOR = path.resolve('src/client/editor');

const listDirectories = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

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

    // A namespace holding declared elements is not itself an element, so
    // descend through it rather than reporting it as missing.
    const undeclared = (relative: string): string[] => {
      if (declared.has(relative)) return [];
      const nested = listDirectories(path.join(EDITOR, relative));
      const claimed = nested.some((name) => declared.has(path.join(relative, name)));
      if (!claimed) return [relative];
      return nested.flatMap((name) => undeclared(path.join(relative, name)));
    };

    expect(listDirectories(EDITOR).flatMap(undeclared)).toEqual([]);
  });
});
