import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve('src');
const CLIENT = path.join(SRC, 'client');

const listLooseSourceFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name))
    .map((entry) => entry.name);

const IMPORT_SPECIFIER = /from\s+['"]([^'"]+)['"]/gu;

const relativeToSrc = (file: string): string =>
  path.relative(SRC, file).replaceAll('\\', '/');

const walkSourceFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkSourceFiles(fullPath);
    }
    if (!/\.(?:ts|tsx)$/u.test(entry.name) || /\.spec\.(?:ts|tsx)$/u.test(entry.name)) {
      return [];
    }
    return [fullPath];
  });
};

const specifiersIn = (file: string): string[] => {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? '');
};

describe('boundaries', () => {
  it('has no loose source files under src or src/client', () => {
    expect(listLooseSourceFiles(SRC)).toEqual([]);
    expect(listLooseSourceFiles(CLIENT)).toEqual([]);
  });

  // App may import editor/view and editor/shell. Anything else under editor is
  // a deep leak until the editor publishes a workspace surface. ui→app is the
  // header/seam cycle until the shell composes that link. This list must not grow.
  const knownDeepLeaks = [
    'client/app/routes/SearchResultRow.tsx -> #client/editor/outline/note-traversal',
    'client/app/routes/document/DocumentSearch.tsx -> #client/editor/outline/note-traversal',
    'client/app/routes/document/DocumentToolbar.tsx -> #client/editor/features/zoom/ZoomBreadcrumbs',
    'client/app/routes/document/DocumentToolbar.tsx -> #client/editor/outline/note-traversal',
    'client/app/routes/document/useDocumentActions.ts -> #client/editor/runtime/pending-document-import',
    'client/app/routes/useDocumentSearchModel.ts -> #client/editor/features/search/search-candidates',
    'client/ui/AppHeader.tsx -> #client/app/routes/DevToolbarSeam',
  ];

  const isPublishedEditorImport = (specifier: string): boolean =>
    specifier.startsWith('#client/editor/view/')
    || specifier.startsWith('#client/editor/shell/');

  it('does not grow the deep-import allowlist', () => {
    const appFiles = walkSourceFiles(path.join(CLIENT, 'app'));
    const uiFiles = walkSourceFiles(path.join(CLIENT, 'ui'));

    const leaks = [...new Set([
      ...appFiles.flatMap((file) =>
        specifiersIn(file)
          .filter((specifier) =>
            specifier.startsWith('#client/editor/') && !isPublishedEditorImport(specifier),
          )
          .map((specifier) => `${relativeToSrc(file)} -> ${specifier}`),
      ),
      ...uiFiles.flatMap((file) =>
        specifiersIn(file)
          .filter((specifier) => specifier.startsWith('#client/app/'))
          .map((specifier) => `${relativeToSrc(file)} -> ${specifier}`),
      ),
    ])].sort();

    expect(leaks).toEqual([...knownDeepLeaks].sort());
  });
});
