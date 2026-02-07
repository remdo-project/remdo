import antfu from '@antfu/eslint-config';
import compatPlugin from 'eslint-plugin-compat';
import lexicalPlugin from '@lexical/eslint-plugin';
import unicornPlugin from 'eslint-plugin-unicorn';
import { commandsInCommandsFileRule } from './config/eslint/commandsInCommandsFile';
import { noLegacyFallbacksRule } from './config/eslint/noLegacyFallbacks';

const { plugins: _unusedUnicornPlugins, ...unicornUnopinionatedConfig } = unicornPlugin.configs.unopinionated;

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
      'unicorn/no-unused-properties': 'error',
      'unicorn/no-useless-undefined': 'error',
      'antfu/no-top-level-await': 'off',
      'no-unreachable': 'error',
    },
  },
  unicornUnopinionatedConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'ts/await-thenable': 'error',
      'ts/no-floating-promises': 'error',
      'ts/no-misused-promises': 'warn',
      'ts/require-await': 'off',
      'ts/no-deprecated': 'warn',
      'ts/no-extra-non-null-assertion': 'error',
      'ts/no-unnecessary-type-assertion': 'warn',
      'ts/no-unnecessary-condition': [
        'warn',
        {
          checkTypePredicates: true,
        },
      ],
      'ts/no-useless-empty-export': 'error',
      'ts/no-unnecessary-boolean-literal-compare': 'warn',
      'ts/no-unnecessary-parameter-property-assignment': 'warn',
      'ts/no-unnecessary-qualifier': 'warn',
      'ts/no-unnecessary-template-expression': 'warn',
      'ts/no-unnecessary-type-arguments': 'warn',
      'ts/no-unnecessary-type-constraint': 'warn',
      'ts/no-unnecessary-type-conversion': 'warn',
      'ts/no-unnecessary-type-parameters': 'warn',
      'ts/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
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
        {
          selector: "CallExpression[callee.property.name='getChecked']",
          message: 'Use $getNoteChecked from #lib/editor/checklist-state instead.',
        },
        {
          selector: "CallExpression[callee.property.name='setChecked']",
          message: 'Use $setNoteChecked from #lib/editor/checklist-state instead.',
        },
        {
          selector: "CallExpression[callee.property.name='toggleChecked']",
          message: 'Use $toggleNoteChecked from #lib/editor/checklist-state instead.',
        },
      ],
      'remdo/no-legacy-fallbacks': 'error',
    },
  },
  {
    files: ['src/editor/plugins/CheckListPlugin.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='env']",
          message: 'Use #config instead of accessing import.meta.env directly.',
        },
      ],
    },
  },
  {
    files: [
      'src/**/*.{js,jsx,ts,tsx,mts,cts}',
      'lib/**/*.{js,jsx,ts,tsx,mts,cts}',
    ],
    rules: {
      'compat/compat': 'error',
      'remdo/commands-in-commands-file': 'error',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,cjs,mjs,mts,cts}'],
    ignores: ['tests/unit/_support/setup/**', 'tests/e2e/editor/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [String.raw`\#editor/*`],
              message: 'Editor e2e helpers are editor-internal; import them only from within tests/e2e/editor/.',
            },
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
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: false,
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
    files: ['tests/unit/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'remdoTest',
          message: 'Access the bridge via ctx.remdo._bridge instead of the global remdoTest.',
        },
      ],
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
        {
          selector: "MemberExpression[property.name='_bridge']",
          message: 'Use the public remdo test API; _bridge is reserved for test setup helpers.',
        },
      ],
    },
  },
  {
    files: ['tests/e2e/editor/**/*.{ts,tsx,js,jsx,mts,cts}'],
    ignores: ['tests/e2e/editor/_support/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              message: 'Use the editor-scoped harness from tests/e2e/editor/_support/fixtures instead of importing @playwright/test directly.',
            },
          ],
          patterns: [
            {
              group: ['../_support/fixtures', '../../_support/fixtures', 'tests/e2e/_support/fixtures'],
              message: 'Use the editor-scoped harness from tests/e2e/editor/_support/fixtures.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/e2e/editor/**/*.spec.{ts,tsx}'],
    ignores: ['tests/e2e/editor/_support/**/*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.object.name="page"][callee.property.name="locator"]',
          message: 'Use editor-scoped helpers (withinEditor/editorLocator) instead of page.locator in editor specs.',
        },
      ],
    },
  },
  {
    files: ['tests/unit/_support/setup/_internal/lexical/hooks.tsx'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['tests/**/_support/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    rules: {
      'no-restricted-syntax': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    plugins: {
      '@lexical': lexicalPlugin,
      compat: compatPlugin,
      remdo: {
        rules: {
          'commands-in-commands-file': commandsInCommandsFileRule,
          'no-legacy-fallbacks': noLegacyFallbacksRule,
        },
      },
    },
    rules: {
      '@lexical/rules-of-lexical': 'error',
    },
  },
  {
    files: ['tools/**/*.{ts,tsx,js,jsx,mts,cts,cjs,mjs}'],
    rules: {
      'no-console': [
        'error',
        {
          allow: ['info', 'warn', 'error'],
        },
      ],
    },
  },
);
