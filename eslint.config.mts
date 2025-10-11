import antfu from '@antfu/eslint-config';

export default antfu(
  {
    react: true,
    typescript: true,
    ignores: ['node_modules/**', 'data/**', 'public/**'],
    stylistic: false,
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'ts/no-floating-promises': 'error',
      'ts/no-misused-promises': 'warn',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'vitest-preview',
            importNames: ['debug'],
            message: 'debug() is for local debugging only; remove before committing.',
          },
        ],
      }],
    },
  },
);
