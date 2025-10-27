declare module 'lexical-vue/dist/shared/useCollaborationContext.js' {
  import type { Doc } from 'yjs';

  export interface CollaborationContextState {
    clientID: number;
    color: string;
    isCollabActive: boolean;
    name: string;
    yjsDocMap: Map<string, Doc>;
  }

  export const collaborationContext: {
    value: CollaborationContextState;
  };
}
