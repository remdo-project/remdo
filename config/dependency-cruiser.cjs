/**
 * Graph-wide checks `eslint-plugin-boundaries` cannot make: it inspects imports
 * one file at a time and so cannot see a cycle. Also the source of the coupling
 * metrics used to assess module ownership.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'A cycle means neither module can be understood, moved, or tested without the other.',
      severity: 'error',
      from: { pathNot: '\\.spec\\.[jt]sx?$' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Anchored: an unanchored `/data/` would skip a nested `src/**/data/`
    // while missing the repo-root directory it means, silently dropping those
    // modules from the crawl.
    exclude: { path: '^(node_modules|data|dist)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Without explicit extensions, relative TypeScript imports resolve to
    // nothing and the run reports a clean graph it never actually read.
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
