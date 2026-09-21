// Ambient types for the markdownlint-cli2 subpath entry point used by
// custom-rule specs: its subpath exports carry no declarations of their own.

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
