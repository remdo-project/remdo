// Ambient types for the markdownlint entry points used by the custom-rule spec.
// markdownlint ships types, but only as a transitive dependency under
// markdownlint-cli2 (whose subpath exports carry no declarations), so the
// specifiers below resolve at runtime yet are untyped to tsc. The custom rule
// modules are plain `.mjs` (cli2 loads them via dynamic import at runtime, so
// they cannot be `.ts`); typing them as the markdownlint rule object is enough
// for the spec. These declarations only need to cover the surface the spec uses.

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
