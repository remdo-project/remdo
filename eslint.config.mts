import antfu from '@antfu/eslint-config';
import lexicalPlugin from '@lexical/eslint-plugin';
import compatPlugin from 'eslint-plugin-compat';

export default antfu(
  {
    react: true,
    typescript: true,
    ignores: ['node_modules/**', 'data/**', 'public/**'],
    stylistic: false,
    // disable as they slow down changes a lot (ai assitants in particular)
    rules: {
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-named-exports': 'off',
    },
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
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='env']",
          message: 'Use #config instead of accessing import.meta.env directly.',
        },
      ],
      'compat/compat': 'error',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,cjs,mjs,mts,cts}'],
    ignores: ['tests/unit/_support/setup/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/_support/setup/**'],
              message: 'Test setup helpers are internal; reference them via Vitest configuration instead of importing directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['config/index.ts'],
    rules: {
      'node/no-process-env': 'off',
      'no-restricted-syntax': 'off',
      'node/prefer-global/process': 'off',
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
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='mutate'] CallExpression[callee.type='Identifier'][callee.name='expect']",
          message: 'Run expectations outside lexical.mutate(); use lexical.validate() after the mutation completes.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='update']:matches([callee.object.property.name='editor'], [callee.object.name='editor']) CallExpression[callee.type='Identifier'][callee.name='expect']",
          message: 'Run expectations outside editor.update(); validate state after committing.',
        },
      ],
    },
  },
  {
    plugins: {
      '@lexical': lexicalPlugin,
      compat: compatPlugin,
    },
    rules: {
      '@lexical/rules-of-lexical': 'error',
    },
  },
);
