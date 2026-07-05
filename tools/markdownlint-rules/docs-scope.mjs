// Shared scoping for RemDo's custom markdownlint rules. Both prose rules apply
// to the top-level `docs/` tree only — skill files are exempt (their References
// link sibling skills by design, and the temporal check conservatively stays off
// them too). cli2 runs from the repo root and passes the absolute file path as
// `params.name`; fixture-driven `lint()` calls pass a repo-relative string.
// Reduce both to a repo-relative POSIX path (strip a leading cwd), then require a
// literal `docs/` prefix — an anchored test, so a nested `src/docs/x.md` is *not*
// in scope (only the repo's own `docs/` tree is).

import process from 'node:process';

/**
 * Reduce a `params.name` to a repo-relative, forward-slash path. An absolute
 * path from cli2 has the repo root (cwd) stripped; a fixture-relative path is
 * returned as-is.
 *
 * @param {string} name The file name/path from markdownlint's `params.name`.
 * @returns {string} The repo-relative POSIX path.
 */
const repoRelative = (name) => {
  const posix = name.replace(/\\/g, '/');
  const root = `${process.cwd().replace(/\\/g, '/')}/`;
  return posix.startsWith(root) ? posix.slice(root.length) : posix;
};

/**
 * @param {string} name The file name/path from markdownlint's `params.name`.
 * @returns {boolean} Whether the file lives under the repo's top-level `docs/`.
 */
export const isDocsFile = (name) => repoRelative(name).startsWith('docs/');

/**
 * @param {string} name The file name/path from markdownlint's `params.name`.
 * @returns {string} The repo-relative POSIX path (for exact-match exemptions).
 */
export const docsPath = (name) => repoRelative(name);
