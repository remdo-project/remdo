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

  // ui→app is the header/seam cycle until the shell composes that link.
  // App→editor internals are refused by eslint (view/shell only).
  const knownDeepLeaks = [
    'client/ui/AppHeader.tsx -> #client/app/routes/DevToolbarSeam',
  ];

  it('does not grow the deep-import allowlist', () => {
    const leaks = [...new Set(
      walkSourceFiles(path.join(CLIENT, 'ui')).flatMap((file) =>
        specifiersIn(file)
          .filter((specifier) => specifier.startsWith('#client/app/'))
          .map((specifier) => `${relativeToSrc(file)} -> ${specifier}`),
      ),
    )].sort();

    expect(leaks).toEqual([...knownDeepLeaks].sort());
  });
});
