import { collaborationContext } from 'lexical-vue/dist/shared/useCollaborationContext.js';
import type { CollaborationContextState } from 'lexical-vue/dist/shared/useCollaborationContext.js';

const contextStack: CollaborationContextState[] = [];

function cloneContext(source: CollaborationContextState): CollaborationContextState {
  return {
    ...source,
    clientID: 0,
    isCollabActive: false,
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
