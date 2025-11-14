import type { Rule } from 'eslint';
import type { Expression, Identifier, Literal, MemberExpression } from 'estree';

/**
 * This rule enforces the project's modern-only runtime policy by blocking
 * feature-detection branches and APIs that only exist to support legacy browsers.
 */
const LEGACY_PROPERTIES = new Set([
  'document.attachEvent',
  'document.all',
  'document.documentMode',
  'document.selection',
  'window.clipboardData',
]);

const MODERN_FEATURES = new Set([
  'window.fetch',
  'globalThis.fetch',
  'fetch',
  'Promise',
  'window.Promise',
  'globalThis.Promise',
  'IntersectionObserver',
  'window.IntersectionObserver',
  'globalThis.IntersectionObserver',
  'ResizeObserver',
  'window.ResizeObserver',
  'AbortController',
  'window.AbortController',
  'requestAnimationFrame',
  'window.requestAnimationFrame',
  'selection.extend',
]);

const LEGACY_UA_PATTERNS = ['MSIE', 'Trident', 'Edge/12', 'Android 4'];

function getMemberName(node: MemberExpression | Identifier): string | null {
  if (node.type === 'Identifier') {
    return node.name;
  }
  const parts: string[] = [];
  let current: MemberExpression | Identifier | Expression | null = node;
  while (current) {
    if (current.type === 'Identifier') {
      parts.unshift(current.name);
      break;
    }
    if (
      current.type === 'MemberExpression' &&
      current.property &&
      current.property.type === 'Identifier'
    ) {
      parts.unshift(current.property.name);
      current = current.object as MemberExpression | Identifier | Expression | null;
    } else {
      return null;
    }
  }
  return parts.join('.');
}

function isUndefinedLiteral(node: Literal | Expression): boolean {
  return (
    (node.type === 'Identifier' && node.name === 'undefined') ||
    (node.type === 'Literal' && node.value === 'undefined')
  );
}

function isModernFeature(node: Expression): string | null {
  if (node.type === 'Identifier' || node.type === 'MemberExpression') {
    const name = getMemberName(node as MemberExpression | Identifier);
    if (name && MODERN_FEATURES.has(name)) {
      return name;
    }
  }
  return null;
}

export const noLegacyFallbacksRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow legacy/browser fallback branches; the project only supports modern runtimes declared in package.json.',
    },
    schema: [],
    messages: {
      legacyFallback:
        'Legacy fallbacks are unsupported; remove feature-detection for {{name}} and rely on the declared runtime matrix.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const name = getMemberName(node as MemberExpression);
        if (name && LEGACY_PROPERTIES.has(name)) {
          context.report({ node, messageId: 'legacyFallback', data: { name } });
        }
        if (name === 'navigator.userAgent') {
          const parent = node.parent as any;
          if (
            parent &&
            parent.type === 'MemberExpression' &&
            parent.parent &&
            parent.parent.type === 'CallExpression'
          ) {
            const call = parent.parent;
            if (
              call.arguments.some(
                (arg: any) =>
                  arg.type === 'Literal' &&
                  typeof arg.value === 'string' &&
                  LEGACY_UA_PATTERNS.some((pattern) => arg.value.includes(pattern))
              )
            ) {
              context.report({
                node,
                messageId: 'legacyFallback',
                data: { name: 'navigator.userAgent sniffing' },
              });
            }
          }
        }
      },
      UnaryExpression(node) {
        if (node.operator === 'typeof' && node.argument) {
          const feature = isModernFeature(node.argument);
          if (
            feature &&
            node.parent &&
            node.parent.type === 'BinaryExpression' &&
            isUndefinedLiteral(node.parent.right)
          ) {
            context.report({ node, messageId: 'legacyFallback', data: { name: feature } });
          }
        }
        if (node.operator === '!' && node.argument) {
          const feature = isModernFeature(node.argument);
          if (feature) {
            context.report({ node, messageId: 'legacyFallback', data: { name: feature } });
          }
        }
      },
      BinaryExpression(node) {
        if (node.operator === 'in' && node.left.type === 'Literal' && typeof node.left.value === 'string') {
          const objectName = node.right.type === 'Identifier' || node.right.type === 'MemberExpression'
            ? getMemberName(node.right as MemberExpression | Identifier)
            : null;
          const featureName = objectName ? `${objectName}.${node.left.value}` : null;
          if (featureName && MODERN_FEATURES.has(featureName)) {
            context.report({ node, messageId: 'legacyFallback', data: { name: featureName } });
          }
        }
      },
    };
  },
};
