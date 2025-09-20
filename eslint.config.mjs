import antfu from '@antfu/eslint-config';
import globals from 'globals';

export default antfu(
  {
    react: true,
    typescript: true,
    ignores: ['lexical/**', 'node_modules/**', 'data/**', 'public/**', 'bookmarks/**'],
    stylistic: false,
    rules: {
      'react-refresh/only-export-components': 'off',
      // TODO: Re-enable automatic import sorting after agreeing on grouping conventions for Lexical helpers.
      'perfectionist/sort-imports': 'off',
      // TODO: Same as above for named members; current ordering matches Lexical docs and would be noisy to rewrite.
      'perfectionist/sort-named-imports': 'off',
      // TODO: Evaluate whether sorted exports are desirable once module boundaries are stabilized.
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-named-exports': 'off',
      // TODO: Align object property sorting with existing manual ordering before enabling.
      'perfectionist/sort-objects': 'off',
      // TODO: Keep key order in package.json/tsconfig for readability; revisit when we automate config generation.
      'jsonc/sort-keys': 'off',
      // TODO: Current YAML uses quoted values for clarity; drop when we standardize our YAML formatting.
      'yaml/plain-scalar': 'off',
      // TODO: Usage of the global `process` is deliberate in build scripts; consider switching to explicit imports later.
      'node/prefer-global/process': 'off',
      // TODO: Type-only import enforcement needs a broader refactor; postpone until the editor layer settles.
      'ts/consistent-type-imports': 'off',
      // TODO: Inline type specifier style changes are noisy; keep current style until we apply a codemod.
      'import/consistent-type-specifier-style': 'off',
      // TODO: Duplicated import blocks group commands semantically; revisit when codemods can preserve comments.
      'import/no-duplicates': 'off',
      // TODO: Maintain legacy type aliases until we decide on interface/type usage across the codebase.
      'ts/consistent-type-definitions': 'off',
      // TODO: Method signature style enforcement conflicts with shared declaration files; re-evaluate later.
      'ts/method-signature-style': 'off',
      // TODO: The helper utilities rely on `this` aliases to mirror Lexical internals; needs deeper cleanup.
      'ts/no-this-alias': 'off',
      // TODO: Keep template conversions out until we verify no regressions in string building utilities.
      'prefer-template': 'off',
      // TODO: Numeric parsing helpers rely on the global functions; revisit with a dedicated utility wrapper.
      'unicorn/prefer-number-properties': 'off',
      // TODO: React 19 migration will happen separately; context usage stays as-is for now.
      'react/no-use-context': 'off',
      // TODO: Same for context provider ergonomics once we adopt the new `use` API.
      'react/no-context-provider': 'off',
      // TODO: The provider value objects are memoized via editor updates; revisit once we benchmark alternatives.
      'react/no-unstable-context-value': 'off',
      // TODO: Hooks-extra recommendations need broader refactors; keep disabled until we plan that work.
      'react-hooks-extra/no-direct-set-state-in-use-effect': 'off',
      'react-hooks-extra/prefer-use-state-lazy-initialization': 'off',
      // TODO: Keep exhaustive deps at warn to avoid noisy failures while we migrate to `use`.
      'react-hooks/exhaustive-deps': 'warn',
      // TODO: Listener lifetimes are managed via Lexical's cleanup helpers; document this before re-enabling.
      'react-web-api/no-leaked-event-listener': 'off',
      // TODO: Retain debugging output until we add a structured logger.
      'no-console': 'off',
      // TODO: Yjs inspection utilities rely on bracket access for reserved keys.
      'dot-notation': 'off',
      // TODO: Node protocol prefixes will be addressed alongside the build tooling revamp.
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/error-message': 'off',
      'unicorn/new-for-builtins': 'off',
      'unicorn/throw-new-error': 'off',
      'unicorn/prefer-type-error': 'off',
      'unicorn/no-instanceof-builtins': 'off',
      // TODO: Preserve callback style in tests/plugins where lexical `this` is unused but readability matters.
      'prefer-arrow-callback': 'off',
      // TODO: Legacy test helpers rely on grouped declarations; revisit with refactors.
      'one-var': 'off',
      'vars-on-top': 'off',
      // TODO: Numeric helpers use Math.pow intentionally for clarity; keep until we switch to BigInt-safe helpers.
      'prefer-exponentiation-operator': 'off',
      // TODO: Module layout uses helper hoisting patterns; disable until we restructure the utils package.
      'ts/no-use-before-define': 'off',
      'import/first': 'off',
      // TODO: Regular expression normalization requires dedicated tests; skip for now.
      'regexp/prefer-w': 'off',
      'regexp/prefer-d': 'off',
      'regexp/no-dupe-character-class': 'off',
      'regexp/no-dupe-characters-character-class': 'off',
      'regexp/use-ignore-case': 'off',
    },
  },
  {
    files: [
      'config/**/*.{ts,tsx,js,mjs,cjs}',
      'vite.config.*',
      'hocuspocus.mjs',
      'playwright.config.*',
      'tests/**/*.{ts,tsx,js}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // TODO: Allow Playwright's `use` fixture helpers without tripping React hook heuristics.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
