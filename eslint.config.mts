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
    files: ['**/*.{js,jsx,ts,tsx,cjs,mjs,mts,cts}'],
    rules: {
      semi: ['error', 'always'],
      'node/no-process-env': [
        'error',
        {
          allowedVariables: ['NODE_ENV'],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,cjs,mjs,mts,cts}'],
    ignores: ['config/env.client.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='env']",
          message: 'Use #env-client instead of accessing import.meta.env directly.',
        },
      ],
    },
  },
  {
    files: ['config/env.client.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.tests.json',
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='preview']",
          message: 'preview() is for local debugging only; remove preview() calls before committing.',
        },
      ],
    },
  },
);
