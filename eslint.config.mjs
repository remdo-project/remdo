import antfu from '@antfu/eslint-config';
import globals from 'globals';

export default antfu(
  {
    react: true,
    typescript: true,
    ignores: ['lexical/**', 'node_modules/**', 'data/**', 'public/**', 'bookmarks/**'],
    stylistic: false,
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'clear'] }],
      'yaml/plain-scalar': 'off',
      'jsonc/sort-keys': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-named-exports': 'off',
      'perfectionist/sort-objects': 'off',
      'node/prefer-global/process': 'off',
      'ts/consistent-type-imports': 'off',
      'ts/ban-ts-comment': ['error', { 'ts-nocheck': false }], //TODO remove once all issues are fixed
      'import/consistent-type-specifier-style': 'off',
      'import/no-duplicates': 'off',
      'ts/consistent-type-definitions': 'off',
      'ts/no-use-before-define': 'off',
      'import/first': 'off',
      'prefer-template': 'off',
      'prefer-arrow-callback': 'off',
      'prefer-exponentiation-operator': 'off',
      'one-var': 'off',
      'dot-notation': 'off',
      'ts/method-signature-style': 'off',
      'regexp/prefer-w': 'off',
      'regexp/prefer-d': 'off',
      'regexp/no-dupe-character-class': 'off',
      'regexp/no-dupe-characters-character-class': 'off',
      'regexp/use-ignore-case': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/prefer-number-properties': 'off',
      'unicorn/error-message': 'off',
      'unicorn/new-for-builtins': 'off',
      'unicorn/throw-new-error': 'off',
      'unicorn/prefer-type-error': 'off',
      'unicorn/no-instanceof-builtins': 'off',
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
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  //async function rules
  {
    files: ['src/**/*.{ts,tsx}', 'types/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          defaultProject: './tsconfig.json',
        },
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      'ts/no-floating-promises': 'error',
      'ts/no-misused-promises': 'warn',
    },
  },
  //async function rules (tests)
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.tests.json'],
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      'ts/no-floating-promises': 'error',
      'ts/no-misused-promises': 'warn',
    },
  },
);
