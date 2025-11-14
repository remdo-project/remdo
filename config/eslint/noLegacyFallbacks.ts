import type { Rule } from 'eslint';

const LEGACY_IDENTIFIERS = new Set([
  'documentMode',
  'attachEvent',
  'selection.extend',
]);

export const noLegacyFallbacksRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow legacy/browser fallback branches; the project only supports modern runtimes defined in package.json.',
    },
    schema: [],
    messages: {
      legacyFallback:
        'Legacy fallbacks are unsupported; rely on the declared runtime matrix instead of feature-detecting {{name}}.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const parts: string[] = [];
        let current: any = node;
        while (current) {
          if (current.property && 'name' in current.property) {
            parts.unshift(current.property.name as string);
          }
          if (current.object && 'name' in current.object) {
            parts.unshift(current.object.name as string);
            break;
          }
          current = current.object;
        }

        const name = parts.join('.');
        if (LEGACY_IDENTIFIERS.has(name)) {
          context.report({ node, messageId: 'legacyFallback', data: { name } });
        }
      },
    };
  },
};
