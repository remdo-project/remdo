import path from 'node:path';
import type { Rule } from 'eslint';
import type { CallExpression, ImportDeclaration } from 'estree';

const TARGET_SUFFIX = path.normalize('src/editor/commands.ts');

function isAllowedFilename(filename: string): boolean {
  if (!filename || filename === '<input>' || filename === '<text>') {
    return true;
  }
  return path.normalize(filename).endsWith(TARGET_SUFFIX);
}

export const commandsInCommandsFileRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce createCommand usage only inside src/editor/commands.ts.',
    },
    schema: [],
    messages: {
      moveCommand:
        'Define commands via createCommand in src/editor/commands.ts only; move this command there.',
    },
  },
  create(context) {
    const lexicalCreateAliases = new Set<string>();
    const filename = context.physicalFilename;
    const allowHere = isAllowedFilename(filename);

    return {
      ImportDeclaration(node) {
        if (allowHere) return;
        const declaration = node as ImportDeclaration;
        if (declaration.source.value !== 'lexical') return;
        for (const specifier of declaration.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'createCommand'
          ) {
            lexicalCreateAliases.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (allowHere) return;
        const call = node as CallExpression;
        if (call.callee.type !== 'Identifier') return;
        const name = call.callee.name;
        if (name === 'createCommand' || lexicalCreateAliases.has(name)) {
          context.report({ node: call, messageId: 'moveCommand' });
        }
      },
    };
  },
};
