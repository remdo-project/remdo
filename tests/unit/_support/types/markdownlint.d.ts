// Ambient types for the markdownlint entry points used by product and skill
// custom-rule specs. markdownlint ships types, but only as a transitive
// dependency under markdownlint-cli2, whose subpath exports carry no
// declarations. The custom rules are plain `.mjs` because cli2 loads them by
// dynamic import at runtime.

declare module 'markdownlint-cli2/markdownlint/promise' {
  interface LintError {
    lineNumber: number;
    ruleNames: string[];
    errorDetail?: string;
  }
  interface LintOptions {
    strings?: Record<string, string>;
    files?: string[];
    customRules: unknown[];
    config: Record<string, unknown>;
  }
  export function lint(options: LintOptions): Promise<Record<string, LintError[]>>;
}

declare module '*/lint-rules/temporal-status.mjs' {
  const rule: unknown;
  export default rule;
}

declare module '*/lint-rules/references-shape.mjs' {
  const rule: unknown;
  export default rule;
}

declare module '*/markdownlint-rules/link-aware-line-length.mjs' {
  const rule: unknown;
  export default rule;
}
