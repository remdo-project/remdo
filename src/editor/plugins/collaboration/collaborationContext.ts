import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import type { Doc } from 'yjs';

interface CollaborationContextType {
  clientID: number;
  color: string;
  isCollabActive: boolean;
  name: string;
  yjsDocMap: Map<string, Doc>;
}

const require = createRequire(import.meta.url);
const modulePath = resolve(
  process.cwd(),
  'node_modules/lexical-vue/dist/shared/useCollaborationContext.js'
);

const { collaborationContext } = require(modulePath) as {
  collaborationContext: { value: CollaborationContextType };
};

const contextStack: CollaborationContextType[] = [];

function cloneContext(source: CollaborationContextType): CollaborationContextType {
  return {
    clientID: 0,
    color: source.color,
    isCollabActive: false,
    name: source.name,
    yjsDocMap: new Map(),
  };
}

export function pushCollaborationContext(): () => void {
  const previous = collaborationContext.value;
  contextStack.push(previous);

  collaborationContext.value = cloneContext(previous);

  return () => {
    const restored = contextStack.pop() ?? previous;
    collaborationContext.value = restored;
  };
}
