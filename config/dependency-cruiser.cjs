/**
 * Dependency graph checks that complement the `remdo/editor-module-boundaries`
 * ESLint rule. That rule owns which editor folders may import which; this owns
 * the questions it cannot answer — cycles, and the coupling metrics used to
 * assess module ownership (docs/todo.md, editor module ownership).
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
    exclude: { path: 'node_modules|/data/|/dist/' },
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
