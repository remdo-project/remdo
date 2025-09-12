import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  // Ignore large/generated/external trees
  { ignores: ['lexical/**', 'node_modules/**', 'data/**', 'public/**', 'bookmarks/**'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript + React rules (mirrors previous .eslintrc.json)
  {
    files: ['**/*.{ts,tsx,cts,mts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // TS type-checker handles undefined variables in TS; avoid false positives
      'no-undef': 'off',
      'react/jsx-uses-react': 'warn',
      'react/jsx-uses-vars': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': 'warn',
      'react/prop-types': 'off',
      'linebreak-style': ['warn', 'unix'],
      'semi': ['warn', 'always'],
      'no-unused-vars': 'warn',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Keep Prettier last to turn off stylistic rules
  prettier,
  // Node globals for server/config/tests
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
  },
];
