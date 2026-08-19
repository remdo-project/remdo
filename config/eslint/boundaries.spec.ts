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

const IMPORT_SPECIFIER = /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/gu;

const relativeToSrc = (file: string): string =>
  path.relative(SRC, file).replaceAll('\\', '/');

const relativeToRoot = (fromFile: string, specifier: string, root: string): string | null => {
  if (specifier.startsWith('.')) {
    const relative = path.relative(root, path.resolve(path.dirname(fromFile), specifier));
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    return relative.replaceAll('\\', '/');
  }
  return null;
};

const editorImportPath = (fromFile: string, specifier: string): string | null => {
  if (specifier.startsWith('#client/editor/')) {
    return specifier.slice('#client/editor/'.length);
  }
  return relativeToRoot(fromFile, specifier, path.join(CLIENT, 'editor'));
};

const appImportPath = (fromFile: string, specifier: string): string | null => {
  if (specifier.startsWith('#client/app/')) {
    return specifier.slice('#client/app/'.length);
  }
  return relativeToRoot(fromFile, specifier, path.join(CLIENT, 'app'));
};

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

  const isPublishedEditorImport = (relative: string): boolean =>
    relative.startsWith('view/')
    || relative.startsWith('shell/')
    // DEV-gated editor/dev loads are the production-bundle seam
    // (docs/architecture.md#production-bundle-boundary), not a workspace leak.
    || relative.startsWith('dev/');

  const leaksFrom = (
    root: string,
    importedPath: (fromFile: string, specifier: string) => string | null,
    isLeak: (relative: string) => boolean,
  ): string[] =>
    [...new Set(
      walkSourceFiles(root).flatMap((file) =>
        specifiersIn(file)
          .filter((specifier) => {
            const relative = importedPath(file, specifier);
            return relative !== null && isLeak(relative);
          })
          .map((specifier) => `${relativeToSrc(file)} -> ${specifier}`),
      ),
    )].sort();

  it('does not grow the deep-import allowlist', () => {
    const leaks = [
      ...leaksFrom(
        path.join(CLIENT, 'app'),
        editorImportPath,
        (relative) => !isPublishedEditorImport(relative),
      ),
      ...leaksFrom(
        path.join(CLIENT, 'ui'),
        appImportPath,
        () => true,
      ),
    ].sort();

    expect(leaks).toEqual([...knownDeepLeaks].sort());
  });
});
