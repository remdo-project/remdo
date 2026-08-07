// Ambient types for the markdownlint entry points used by product custom-rule
// specs. markdownlint ships types, but only as a transitive
// dependency under markdownlint-cli2, whose subpath exports carry no
// declarations. The custom rules are plain `.mjs` because cli2 loads them by
// dynamic import at runtime.

declare module 'markdownlint-cli2/markdownlint/promise' {
  interface LintError {
    lineNumber: number;
  }
  interface LintOptions {
    strings?: Record<string, string>;
    customRules: unknown[];
    config: Record<string, unknown>;
  }
  export function lint(options: LintOptions): Promise<Record<string, LintError[]>>;
}

declare module '*/markdownlint-rules/link-aware-line-length.mjs' {
  const rule: unknown;
  export default rule;
}
