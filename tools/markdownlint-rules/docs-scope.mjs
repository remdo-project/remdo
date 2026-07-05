// Shared scoping for RemDo's custom markdownlint rules. Both prose rules apply
// to `docs/` only — skill files are exempt (their References link sibling skills
// by design, and the temporal check conservatively stays off them too). cli2
// passes the absolute file path as `params.name`; fixture-driven `lint()` calls
// pass a repo-relative string. Normalize to forward slashes and treat any path
// with a `docs/` segment as in-scope, so both invocation styles agree.

/**
 * @param {string} name The file name/path from markdownlint's `params.name`.
 * @returns {boolean} Whether the file lives under `docs/`.
 */
export const isDocsFile = (name) => {
  const posix = name.replace(/\\/g, '/');
  return posix === 'docs' || posix.startsWith('docs/') || posix.includes('/docs/');
};

/**
 * @param {string} name The file name/path from markdownlint's `params.name`.
 * @returns {string} The path's basename (final segment).
 */
export const basename = (name) => name.replace(/\\/g, '/').split('/').pop() ?? name;
